/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 *
 * Silent Claw — Layer 2: ONNX Runtime
 *
 * Локальный ML inference для toxicity detection.
 * Используем quantized модели для скорости:
 * - Xenova/toxic-bert (English)
 * - Для русского: fine-tuned RuBERT-toxic
 *
 * Performance:
 * - First load: 2-5s (model download/cache)
 * - Inference: 20-50ms per text
 * - Memory: ~100MB
 *
 * Fallback: если ONNX недоступен, пропускаем к LLM.
 */

export interface ONNXResult {
  toxicity: number;
  isToxic: boolean;
  categories: {
    toxic: number;
    severeToxic: number;
    obscene: number;
    threat: number;
    insult: number;
    identityHate: number;
  };
  latencyMs: number;
}

type TransformersModule = {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>>;
};

let toxicityClassifier: ((input: unknown, options?: Record<string, unknown>) => Promise<unknown>) | null = null;
let modelLoading = false;
let modelError: Error | null = null;

const MODEL_NAME = 'Xenova/toxic-bert';

async function importTransformers(): Promise<TransformersModule> {
  // @xenova/transformers is an optional runtime dependency for local moderation.
  // Use runtime dynamic import to keep typecheck/build independent from it.
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<TransformersModule>;
  return dynamicImport('@xenova/transformers');
}

/**
 * Initialize ONNX model (lazy loading)
 */
export async function initONNX(): Promise<void> {
  if (toxicityClassifier) return;
  if (modelLoading) {
    while (modelLoading) { await new Promise(r => setTimeout(r, 100)); }
    return;
  }

  modelLoading = true;
  console.log('[SilentClaw] Loading ONNX model:', MODEL_NAME);

  try {
    const start = Date.now();

    const { pipeline } = await importTransformers();
    toxicityClassifier = await pipeline('text-classification', MODEL_NAME, {
      quantized: true,
      cache_dir: './.cache/transformers',
    });

    console.log(`[SilentClaw] ONNX model loaded in ${Date.now() - start}ms`);
  } catch (err) {
    modelError = err as Error;
    console.warn('[SilentClaw] ONNX unavailable (install @xenova/transformers):', err);
  } finally {
    modelLoading = false;
  }
}

/**
 * Run ONNX toxicity check
 */
export async function runONNXCheck(text: string): Promise<ONNXResult> {
  const start = Date.now();

  if (!toxicityClassifier && !modelError) { await initONNX(); }

  if (!toxicityClassifier) {
    return neutralResult(Date.now() - start);
  }

  try {
    const truncated = text.slice(0, 2000);
    const result = await toxicityClassifier(truncated, { top_k: 6 });

    const scores: Record<string, number> = {};
    for (const item of result as Array<{ label: string; score: number }>) {
      scores[item.label] = item.score;
    }

    const toxicity = scores['toxic'] || 0;

    return {
      toxicity,
      isToxic: toxicity > 0.85,
      categories: {
        toxic: scores['toxic'] || 0,
        severeToxic: scores['severe_toxic'] || 0,
        obscene: scores['obscene'] || 0,
        threat: scores['threat'] || 0,
        insult: scores['insult'] || 0,
        identityHate: scores['identity_hate'] || 0,
      },
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    console.error('[SilentClaw] ONNX inference error:', err);
    return neutralResult(Date.now() - start);
  }
}

/**
 * Batch check multiple texts
 */
export async function runONNXBatch(texts: string[]): Promise<ONNXResult[]> {
  if (!toxicityClassifier) await initONNX();
  if (!toxicityClassifier) return texts.map(() => neutralResult(0));

  const start = Date.now();
  try {
    const results = await toxicityClassifier(texts, { top_k: 6 });
    return (results as Array<Array<{ label: string; score: number }>>).map((result) => {
      const scores: Record<string, number> = {};
      for (const item of result) { scores[item.label] = item.score; }
      const toxicity = scores['toxic'] || 0;
      return {
        toxicity,
        isToxic: toxicity > 0.85,
        categories: {
          toxic: scores['toxic'] || 0,
          severeToxic: scores['severe_toxic'] || 0,
          obscene: scores['obscene'] || 0,
          threat: scores['threat'] || 0,
          insult: scores['insult'] || 0,
          identityHate: scores['identity_hate'] || 0,
        },
        latencyMs: Math.round((Date.now() - start) / texts.length),
      };
    });
  } catch (err) {
    console.error('[SilentClaw] ONNX batch error:', err);
    return texts.map(() => neutralResult(0));
  }
}

export function isONNXAvailable(): boolean { return toxicityClassifier !== null; }

export function getONNXInfo(): {
  loaded: boolean; model: string; quantized: boolean; error?: string;
} {
  return { loaded: toxicityClassifier !== null, model: MODEL_NAME, quantized: true, error: modelError?.message };
}

function neutralResult(latencyMs: number): ONNXResult {
  return {
    toxicity: 0, isToxic: false, latencyMs,
    categories: { toxic: 0, severeToxic: 0, obscene: 0, threat: 0, insult: 0, identityHate: 0 },
  };
}
