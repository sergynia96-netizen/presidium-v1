/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Presidium Relay Configuration
 */

import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value;
}, z.boolean());

const configSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),

  WS_MAX_PAYLOAD_LENGTH: z.coerce.number().default(16 * 1024 * 1024),
  WS_IDLE_TIMEOUT: z.coerce.number().default(60),
  WS_MAX_BACKPRESSURE: z.coerce.number().default(64 * 1024),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  MODERATION_ENABLED: booleanFromEnv.default(true),
  LLM_URL: z.string().optional(),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[Config] Validation failed:');
  parsed.error.errors.forEach((error) => {
    console.error(`  ${error.path.join('.')}: ${error.message}`);
  });
  process.exit(1);
}

export const config = parsed.data;

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
