/**
 * GLM-4 API Client
 * Free AI API from Zhipu AI (https://open.bigmodel.cn/)
 * Documentation: https://open.bigmodel.cn/dev/api
 */
import fs from 'node:fs';
import path from 'node:path';

export interface GLM4Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GLM4Response {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GLM4Config {
  apiKey: string;
  model?: string;
  baseURL?: string;
  rateLimit?: {
    key?: string;
    maxRequests?: number;
    windowMs?: number;
  };
}

const DEFAULT_CONFIG: GLM4Config = {
  apiKey: '',
  model: process.env.GLM4_MODEL || 'glm-4.7-flash',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
};

interface GLM4RateBucket {
  count: number;
  resetAt: number;
}

const glm4RateBuckets = new Map<string, GLM4RateBucket>();
const DEFAULT_RATE_LIMIT_MAX = Number(process.env.GLM4_RATE_LIMIT_MAX || 120);
const DEFAULT_RATE_LIMIT_WINDOW_MS = Number(process.env.GLM4_RATE_LIMIT_WINDOW_MS || 60_000);

export class GLM4RateLimitError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('GLM-4 rate limit exceeded');
    this.name = 'GLM4RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

let cachedResolvedApiKey: string | null = null;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readApiKeyFromEnvFile(fileName: string): string {
  try {
    if (process.env.NODE_ENV === 'production') return '';
    const filePath = path.join(/*turbopackIgnore: true*/ process.cwd(), fileName);
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^\s*GLM4_API_KEY\s*=\s*(.+)\s*$/m);
    if (!match || !match[1]) return '';
    return stripQuotes(match[1]);
  } catch {
    return '';
  }
}

function isLikelyPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes('your-') ||
    normalized.includes('placeholder') ||
    normalized.includes('change-me') ||
    normalized.includes('example')
  );
}

function resolveGLM4ApiKey(): string {
  if (cachedResolvedApiKey !== null) {
    return cachedResolvedApiKey;
  }

  const fromProcessEnv =
    process.env.GLM4_API_KEY ||
    process.env.GLM_API_KEY ||
    '';

  if (fromProcessEnv.trim() && !isLikelyPlaceholder(fromProcessEnv)) {
    cachedResolvedApiKey = fromProcessEnv.trim();
    return cachedResolvedApiKey;
  }

  const fromEnvLocal = readApiKeyFromEnvFile('.env.local');
  const fromDotEnv = readApiKeyFromEnvFile('.env');
  // Security-by-default: never pull credentials from .env.example unless explicitly allowed.
  const fromExample =
    process.env.ALLOW_ENV_EXAMPLE_KEYS === '1' ? readApiKeyFromEnvFile('.env.example') : '';
  const resolvedCandidates = [fromEnvLocal, fromDotEnv, fromExample].filter(
    (value) => value && !isLikelyPlaceholder(value),
  );
  const resolved = resolvedCandidates[0] || '';
  cachedResolvedApiKey = resolved;
  return resolved;
}

function checkGLM4RateLimit(
  rateLimit?: GLM4Config['rateLimit']
): void {
  if (process.env.GLM4_RATE_LIMIT_DISABLED === '1') return;

  const key = (rateLimit?.key || 'global').trim() || 'global';
  const maxRequests = Math.max(1, rateLimit?.maxRequests || DEFAULT_RATE_LIMIT_MAX);
  const windowMs = Math.max(1000, rateLimit?.windowMs || DEFAULT_RATE_LIMIT_WINDOW_MS);
  const now = Date.now();

  // Opportunistic cleanup for expired buckets.
  for (const [bucketKey, bucket] of glm4RateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      glm4RateBuckets.delete(bucketKey);
    }
  }

  let bucket = glm4RateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    glm4RateBuckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) {
    throw new GLM4RateLimitError(Math.max(0, bucket.resetAt - now));
  }
}

/**
 * Call GLM-4 API
 */
export async function callGLM4(
  messages: GLM4Message[],
  config: Partial<GLM4Config> = {}
): Promise<string> {
  const finalConfig: GLM4Config = {
    ...DEFAULT_CONFIG,
    ...config,
    apiKey: config.apiKey || resolveGLM4ApiKey(),
  };

  if (!finalConfig.apiKey) {
    throw new Error(
      'GLM4_API_KEY is missing or placeholder. Put a real key in .env.local (preferred) or .env.',
    );
  }

  checkGLM4RateLimit(finalConfig.rateLimit);

  const response = await fetch(`${finalConfig.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${finalConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: finalConfig.model || process.env.GLM4_MODEL || 'glm-4.7-flash',
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GLM-4 API error: ${response.status} - ${error}`);
  }

  const data: GLM4Response = await response.json();
  return data.choices[0]?.message?.content || 'Sorry, no response generated.';
}

/**
 * Call GLM-4 with JSON output mode (for structured responses like OpenClaw)
 */
export async function callGLM4JSON<T = unknown>(
  messages: GLM4Message[],
  config: Partial<GLM4Config> = {}
): Promise<T> {
  const response = await callGLM4(messages, config);
  
  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in GLM-4 response');
  }
  
  return JSON.parse(jsonMatch[0]) as T;
}
