/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 *
 * Silent Claw Worker — Async Moderation Pipeline
 *
 * BullMQ worker processing moderation queue.
 * 3-layer pipeline:
 * 1. Regex (0.5ms) — critical patterns, zero false negatives
 * 2. ONNX (20-50ms) — ML classification
 * 3. LLM (800ms-3s) — edge cases, context analysis
 *
 * Actions:
 * - pass: message OK
 * - flag: mark for review, visible to sender
 * - shadow_remove: hidden from others, sender sees "removed"
 * - block: ban user (3 strikes system)
 */

import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { runRegexCheck, type RegexMatch } from './rules.js';
import { runONNXCheck, initONNX } from './onnx.js';
import { db } from '../db/index.js';
import { messages, users, moderationReports } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

// === CONFIG ===

const LLM_URL = process.env.LLM_URL || 'http://localhost:8002/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';

const MODERATION_PROMPT = `Analyze message for community guideline violations.
Respond ONLY with valid JSON: {"violation": boolean, "category": "none"|"toxicity"|"fraud"|"drugs"|"violence"|"spam", "confidence": 0.0-1.0, "severity": "none"|"low"|"medium"|"high"|"critical"}`;

const STRIKE_THRESHOLDS = { shadow_remove: 1, flag: 3, block: 5 };

// === WORKER ===

export function startModerationWorker(redis: Redis): Worker {
  initONNX().catch(console.error);

  const worker = new Worker(
    'silent-claw',
    async (job: Job) => {
      const startTime = Date.now();
      const { messageId, senderId, chatId, messageType, contentHint } = job.data;

      console.log(`[SilentClaw] Processing job ${job.id}, message ${messageId}`);

      // === LAYER 1: Regex (0.5ms) ===
      const regexResult = runRegexCheck(contentHint || '', messageType || 'message');

      if (regexResult.matched && regexResult.rule!.action === 'shadow_remove') {
        await executeAction(messageId, senderId, 'shadow_remove', 'regex', regexResult);
        return { action: 'shadow_remove', source: 'regex', rule: regexResult.rule!.id, latency: Date.now() - startTime };
      }

      if (regexResult.matched && regexResult.rule!.action === 'block') {
        await executeAction(messageId, senderId, 'block', 'regex', regexResult);
        return { action: 'block', source: 'regex', rule: regexResult.rule!.id, latency: Date.now() - startTime };
      }

      // === LAYER 2: ONNX (20-50ms) ===
      const onnxResult = await runONNXCheck(contentHint || '');

      if (onnxResult.isToxic) {
        await executeAction(messageId, senderId, 'shadow_remove', 'onnx', undefined, onnxResult);
        return { action: 'shadow_remove', source: 'onnx', toxicity: onnxResult.toxicity, latency: Date.now() - startTime };
      }

      if (onnxResult.toxicity < 0.3) {
        await logReport(messageId, senderId, 'onnx', 'none', onnxResult.latencyMs);
        return { action: 'pass', source: 'onnx', confidence: 1 - onnxResult.toxicity, latency: Date.now() - startTime };
      }

      // === LAYER 3: LLM (800ms-3s, edge cases only) ===
      try {
        const llmResult = await runLLMCheck(contentHint || '');
        await logReport(messageId, senderId, 'llm', llmResult.severity, Date.now() - startTime, undefined, undefined, llmResult);

        if (llmResult.violation && llmResult.confidence > 0.85) {
          const action = llmResult.severity === 'critical' ? 'shadow_remove' : 'flag';
          await executeAction(messageId, senderId, action, 'llm', undefined, undefined, llmResult);
          return { action, source: 'llm', confidence: llmResult.confidence, latency: Date.now() - startTime };
        }

        return { action: 'pass', source: 'llm', confidence: llmResult.confidence, latency: Date.now() - startTime };
      } catch (err) {
        console.warn('[SilentClaw] LLM failed, fallback to ONNX:', err);
        return { action: onnxResult.toxicity > 0.5 ? 'flag' : 'pass', source: 'onnx-fallback', confidence: onnxResult.toxicity, latency: Date.now() - startTime };
      }
    },
    {
      connection: redis,
      concurrency: 10,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[SilentClaw] Job ${job.id} completed:`, job.returnvalue);
  });

  worker.on('failed', (job, err) => {
    console.error(`[SilentClaw] Job ${job?.id} failed:`, err);
  });

  return worker;
}

// === ACTIONS ===

async function executeAction(
  messageId: string,
  senderId: string,
  action: 'flag' | 'shadow_remove' | 'block',
  source: 'regex' | 'onnx' | 'llm',
  regexResult?: RegexMatch,
  onnxResult?: any,
  llmResult?: any
): Promise<void> {
  await db.update(messages)
    .set({ status: 'removed', removedReason: `silent_claw_${source}` })
    .where(eq(messages.id, messageId));

  await db.update(users)
    .set({ strikes: sql`${users.strikes} + 1` })
    .where(eq(users.id, senderId));

  const user = await db.query.users.findFirst({
    where: eq(users.id, senderId),
    columns: { strikes: true },
  });

  if (user && user.strikes >= STRIKE_THRESHOLDS.block) {
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, senderId));
    console.warn(`[SilentClaw] User ${senderId} banned (${user.strikes} strikes)`);
  }

  await logReport(messageId, senderId, source, action === 'shadow_remove' ? 'high' : 'medium', 0, regexResult, undefined, llmResult);
}

async function logReport(
  messageId: string, senderId: string, source: string, riskLevel: string, latencyMs: number,
  regexResult?: RegexMatch, onnxResult?: any, llmResult?: any
): Promise<void> {
  await db.insert(moderationReports).values({
    targetType: 'message',
    targetId: messageId,
    senderId,
    source,
    riskLevel,
    flags: {
      regex: regexResult ? { matched: regexResult.matched, ruleId: regexResult.rule?.id, matches: regexResult.matches } : undefined,
      onnx: onnxResult,
      llm: llmResult,
    },
    latencyMs,
    action: 'none',
  });
}

// === LLM LAYER ===

async function runLLMCheck(text: string): Promise<{
  violation: boolean;
  category: string;
  confidence: number;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}> {
  if (!LLM_URL || LLM_URL === 'http://localhost:8002/v1/chat/completions') {
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

    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        violation: parsed.violation || false,
        category: parsed.category || 'none',
        confidence: parsed.confidence || 0.5,
        severity: parsed.severity || 'none',
      };
    }
  } catch (err) {
    console.error('[SilentClaw] LLM check failed:', err);
  }

  return { violation: false, category: 'none', confidence: 0.5, severity: 'none' };
}
