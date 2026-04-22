/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Silent Claw Moderation Worker (stub)
 */

import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

export function startModerationWorker(redis: Redis): Worker {
  const worker = new Worker(
    'silent-claw',
    async (job) => {
      console.log('[SilentClaw] Processing job:', job.id, job.data);
      return { action: 'pass', source: 'placeholder' };
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log('[SilentClaw] Job completed:', job.id);
  });

  worker.on('failed', (job, err) => {
    console.error('[SilentClaw] Job failed:', job?.id, err);
  });

  return worker;
}
