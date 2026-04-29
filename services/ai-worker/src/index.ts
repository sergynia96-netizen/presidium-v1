/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 *
 * Presidium AI Worker
 *
 * Standalone worker service for AI-powered features:
 * - Silent Claw moderation (regex + ONNX + LLM pipeline)
 * - Feed content scoring and recommendations
 * - Smart notifications prioritization
 * - Future: AI chat assistant, content generation
 *
 * Runs as a separate process, communicates via Redis (BullMQ queues).
 */

import { Redis } from 'ioredis';
import { Worker } from 'bullmq';
import { runRegexCheck, runONNXCheck, initONNX, getONNXInfo } from '@presidium/shared-moderation';

// === CONFIG ===

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const QUEUE_CONFIG = {
  'silent-claw': { concurrency: 10 },
  'feed-scoring': { concurrency: 5 },
  'notifications': { concurrency: 20 },
};

const LLM_URL = process.env.LLM_URL || '';
const LLM_API_KEY = process.env.LLM_API_KEY || '';

const MODERATION_PROMPT = `Analyze this text for community guideline violations.
Respond ONLY with JSON: {"violation":false,"category":"none","confidence":1.0,"severity":"none"}`;

// === LAYER 3: LLM CHECK ===

async function runLLMCheck(text: string): Promise<{
  violation: boolean;
  category: string;
  confidence: number;
  severity: string;
}> {
  if (!LLM_URL) {
    return { violation: false, category: 'none', confidence: 0.5, severity: 'none' };
  }

  try {
    const response = await fetch(LLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: 'glm-4',
        messages: [
          { role: 'system', content: MODERATION_PROMPT },
          { role: 'user', content: text.slice(0, 500) },
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[^}]+\}/);

    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (err) {
    console.error('[AI-Worker] LLM error:', err);
  }

  return { violation: false, category: 'none', confidence: 0.5, severity: 'none' };
}

// === MAIN ===

async function main() {
  console.log('[AI-Worker] Starting Presidium AI Worker...');

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  redis.on('error', (err: Error) => console.error('[AI-Worker] Redis error:', err));
  redis.on('connect', () => console.log('[AI-Worker] Connected to Redis'));

  // Initialize ONNX models
  console.log('[AI-Worker] Initializing ONNX models...');
  await initONNX().catch((err: Error) => console.warn('[AI-Worker] ONNX init failed:', err));
  console.log('[AI-Worker] ONNX status:', getONNXInfo());

  // === Silent Claw Worker ===
  const moderationWorker = new Worker(
    'silent-claw',
    async (job) => {
      const startTime = Date.now();
      const { messageId, senderId, chatId, messageType, contentHint } = job.data;

      console.log(`[SilentClaw] Job ${job.id}: message ${messageId}`);

      // Layer 1: Regex
      const regexResult = runRegexCheck(contentHint || '', messageType || 'message');

      if (regexResult.matched && (regexResult.rule!.action === 'shadow_remove' || regexResult.rule!.action === 'block')) {
        return {
          action: regexResult.rule!.action,
          source: 'regex',
          rule: regexResult.rule!.id,
          latency: Date.now() - startTime,
        };
      }

      // Layer 2: ONNX
      const onnxResult = await runONNXCheck(contentHint || '');

      if (onnxResult.isToxic) {
        return { action: 'shadow_remove', source: 'onnx', toxicity: onnxResult.toxicity, latency: Date.now() - startTime };
      }

      if (onnxResult.toxicity < 0.3) {
        return { action: 'pass', source: 'onnx', confidence: 1 - onnxResult.toxicity, latency: Date.now() - startTime };
      }

      // Layer 3: LLM (edge cases)
      const llmResult = await runLLMCheck(contentHint || '');

      if (llmResult.violation && llmResult.confidence > 0.85) {
        return {
          action: llmResult.severity === 'critical' ? 'shadow_remove' : 'flag',
          source: 'llm',
          confidence: llmResult.confidence,
          latency: Date.now() - startTime,
        };
      }

      return { action: 'pass', source: 'llm', confidence: llmResult.confidence, latency: Date.now() - startTime };
    },
    { connection: redis.duplicate(), concurrency: QUEUE_CONFIG['silent-claw'].concurrency }
  );

  moderationWorker.on('completed', (job) => console.log(`[SilentClaw] Job ${job.id} done:`, job.returnvalue));
  moderationWorker.on('failed', (job, err) => console.error(`[SilentClaw] Job ${job?.id} failed:`, err));

  // === Feed Scoring Worker ===
  const feedWorker = new Worker(
    'feed-scoring',
    async (job) => {
      const { postId, authorId, content, hasMedia, authorStrikes, authorAge } = job.data;

      let score = 100;

      // Author reputation
      if (authorStrikes) score -= authorStrikes * 50;
      if (authorAge) {
        const daysOld = authorAge / (1000 * 60 * 60 * 24);
        score += Math.min(daysOld * 0.5, 20);
      }

      // Content quality
      if (hasMedia) score += 15;
      if (content) {
        if (content.length > 100 && content.length < 2000) score += 10;
        else if (content.length > 5000) score -= 10;
      }

      // AI quality assessment (optional LLM call)
      // Could be expanded with sentiment analysis

      return { postId, score: Math.max(0, Math.min(200, score)) };
    },
    { connection: redis.duplicate(), concurrency: QUEUE_CONFIG['feed-scoring'].concurrency }
  );

  feedWorker.on('completed', (job) => console.log(`[FeedScoring] Post ${job.data.postId} scored:`, job.returnvalue));
  feedWorker.on('failed', (job, err) => console.error(`[FeedScoring] Failed:`, err));

  // === Notification Worker ===
  const notificationWorker = new Worker(
    'notifications',
    async (job) => {
      const { userId, type, title, body, data } = job.data;

      console.log(`[Notifications] Sending ${type} to ${userId}: ${title}`);

      // Push notification would be sent here via FCM/HMS/APNs
      // For now, just log and mark as processed

      return { userId, type, sent: true, timestamp: Date.now() };
    },
    { connection: redis.duplicate(), concurrency: QUEUE_CONFIG['notifications'].concurrency }
  );

  notificationWorker.on('completed', (job) => console.log(`[Notifications] Delivered to ${job.data.userId}`));
  notificationWorker.on('failed', (job, err) => console.error(`[Notifications] Failed:`, err));

  console.log('[AI-Worker] All workers started. Waiting for jobs...');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[AI-Worker] Shutting down...');
    await moderationWorker.close();
    await feedWorker.close();
    await notificationWorker.close();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[AI-Worker] Fatal error:', err);
  process.exit(1);
});
