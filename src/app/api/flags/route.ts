import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { promises as fs } from 'fs';
import path from 'path';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';

type FlagValue = boolean | string | number | null;
type FlagsMap = Record<string, FlagValue>;

const FLAGS_FILE = path.join(process.cwd(), 'feature-flags.json');

function parseEnvFlag(value: string | undefined): FlagValue {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'null') return null;

  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && trimmed !== '') {
    return asNumber;
  }

  return trimmed;
}

function sanitizeFlags(input: unknown): FlagsMap {
  if (!input || typeof input !== 'object') return {};
  const result: FlagsMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!key || typeof key !== 'string') continue;
    if (
      typeof value === 'boolean' ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      value === null
    ) {
      result[key] = value;
    }
  }
  return result;
}

async function readFlagsFromFile(): Promise<FlagsMap> {
  try {
    const raw = await fs.readFile(FLAGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeFlags(parsed);
  } catch {
    return {};
  }
}

function readFlagsFromEnv(): FlagsMap {
  const result: FlagsMap = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('FLAG_')) continue;
    const flagName = key.slice('FLAG_'.length);
    if (!flagName) continue;
    result[flagName] = parseEnvFlag(value);
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';

    // Public endpoint, but authenticated users get a higher limit.
    const scope = session?.user?.id ? `user:${session.user.id}` : `ip:${ip}`;
    const limit = rateLimit(`flags:get:${scope}`, {
      maxRequests: session?.user?.id ? 120 : 40,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many flag requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const fileFlags = await readFlagsFromFile();
    const envFlags = readFlagsFromEnv();

    // Future extension point:
    // if (session?.user?.id) apply per-user DB overrides (FeatureFlagOverride model).
    const merged: FlagsMap = {
      ...fileFlags,
      ...envFlags,
    };

    return NextResponse.json(merged);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
