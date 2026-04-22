/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Database connection factory
 *
 * PostgreSQL с connection pooling через postgres.js.
 * Для MVP: single instance.
 * Для scale: PgBouncer + read replicas.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: false,
        }
      : false,
  debug: process.env.NODE_ENV === 'development',
  prepare: false,
});

export const db = drizzle(client, { schema });

process.on('SIGTERM', async () => {
  console.log('[DB] Closing connection pool...');
  await client.end();
});

process.on('SIGINT', async () => {
  console.log('[DB] Closing connection pool...');
  await client.end();
});

export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  connections: number;
}> {
  const start = Date.now();

  try {
    const result = await client`SELECT count(*) FROM pg_stat_activity`;
    const latencyMs = Date.now() - start;

    return {
      healthy: true,
      latencyMs,
      connections: parseInt(result[0].count as string, 10),
    };
  } catch {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      connections: 0,
    };
  }
}
