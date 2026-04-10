/**
 * Feature Flags Module
 *
 * Features:
 * - Remote feature flag configuration
 * - A/B testing support
 * - Gradual rollouts
 * - User segmentation
 * - Local override for development
 *
 * Architecture:
 * - Flags fetched from server on app start
 * - Cached in localStorage with TTL
 * - Local overrides via URL params (?flag_name=true)
 * - Evaluated client-side for instant response
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rollout: number; // 0-100 percentage
  segments?: string[]; // user segment IDs
  abTest?: {
    variant: 'A' | 'B';
    weight: number; // 0-1
  };
  expiresAt?: number;
}

export interface FeatureFlagsConfig {
  flags: Record<string, FeatureFlag>;
  fetchedAt: number;
  ttl: number; // milliseconds
}

type RemoteFlagsPayload =
  | Record<string, unknown>
  | {
      flags?: Record<string, unknown>;
    };

// ─── Default Flags ───────────────────────────────────────────────────────────

export const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  e2e_encryption: { key: 'e2e_encryption', enabled: true, rollout: 100 },
  voice_messages: { key: 'voice_messages', enabled: true, rollout: 100 },
  video_circles: { key: 'video_circles', enabled: true, rollout: 100 },
  stories: { key: 'stories', enabled: true, rollout: 50 },
  reactions: { key: 'reactions', enabled: true, rollout: 100 },
  disappearing_messages: { key: 'disappearing_messages', enabled: true, rollout: 100 },
  chat_lock: { key: 'chat_lock', enabled: true, rollout: 100 },
  markdown_formatting: { key: 'markdown_formatting', enabled: true, rollout: 100 },
  link_preview: { key: 'link_preview', enabled: true, rollout: 100 },
  stickers: { key: 'stickers', enabled: true, rollout: 100 },
  gif_search: { key: 'gif_search', enabled: true, rollout: 100 },
  push_notifications: { key: 'push_notifications', enabled: true, rollout: 100 },
  biometric_lock: { key: 'biometric_lock', enabled: true, rollout: 80 },
  group_topics: { key: 'group_topics', enabled: false, rollout: 0 },
  screen_sharing: { key: 'screen_sharing', enabled: false, rollout: 0 },
  group_calls: { key: 'group_calls', enabled: false, rollout: 0 },
};

// ─── Feature Flags Manager ──────────────────────────────────────────────────

const FLAGS_CACHE_KEY = 'presidium-feature-flags';
const FLAGS_TTL = 5 * 60 * 1000; // 5 minutes
let cachedFlags: Record<string, FeatureFlag> = { ...DEFAULT_FLAGS };

function parseFlagEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
      return false;
    }
    return normalized.length > 0;
  }
  return Boolean(value);
}

function normalizeRemoteFlags(payload: unknown): Record<string, FeatureFlag> {
  if (!payload || typeof payload !== 'object') return {};

  const source =
    'flags' in (payload as RemoteFlagsPayload) &&
    (payload as RemoteFlagsPayload).flags &&
    typeof (payload as RemoteFlagsPayload).flags === 'object'
      ? ((payload as RemoteFlagsPayload).flags as Record<string, unknown>)
      : (payload as Record<string, unknown>);

  const normalized: Record<string, FeatureFlag> = {};

  for (const [key, rawValue] of Object.entries(source)) {
    if (!key) continue;

    if (rawValue && typeof rawValue === 'object') {
      const maybeFlag = rawValue as Partial<FeatureFlag> & { enabled?: unknown; rollout?: unknown };
      if ('enabled' in maybeFlag) {
        normalized[key] = {
          key,
          enabled: parseFlagEnabled(maybeFlag.enabled),
          rollout:
            typeof maybeFlag.rollout === 'number' && Number.isFinite(maybeFlag.rollout)
              ? Math.max(0, Math.min(100, maybeFlag.rollout))
              : 100,
          ...(Array.isArray(maybeFlag.segments) ? { segments: maybeFlag.segments } : {}),
          ...(maybeFlag.abTest ? { abTest: maybeFlag.abTest } : {}),
          ...(typeof maybeFlag.expiresAt === 'number' ? { expiresAt: maybeFlag.expiresAt } : {}),
        };
        continue;
      }
    }

    normalized[key] = {
      key,
      enabled: parseFlagEnabled(rawValue),
      rollout: 100,
    };
  }

  return normalized;
}

/**
 * Initialize feature flags.
 * Fetches from server and applies local overrides.
 */
export async function initFeatureFlags(userId?: string): Promise<void> {
  // Load from cache
  loadCachedFlags();

  // Check if cache is stale
  const cacheData = localStorage.getItem(FLAGS_CACHE_KEY);
  if (cacheData) {
    const parsed: FeatureFlagsConfig = JSON.parse(cacheData);
    if (Date.now() - parsed.fetchedAt < parsed.ttl) {
      applyLocalOverrides(userId);
      return;
    }
  }

  // Fetch from server
  try {
    const response = await fetch('/api/flags');
    if (response.ok) {
      const data = (await response.json()) as unknown;
      const remoteFlags = normalizeRemoteFlags(data);
      cachedFlags = { ...DEFAULT_FLAGS, ...remoteFlags };
      saveCachedFlags();
    }
  } catch {
    // Use cached/default flags
  }

  applyLocalOverrides(userId);
}

/**
 * Check if a feature flag is enabled.
 */
export function isFeatureEnabled(key: string, userId?: string): boolean {
  const flag = cachedFlags[key];
  if (!flag) return false;
  if (!flag.enabled) return false;

  // Check rollout percentage
  if (flag.rollout < 100) {
    const hash = hashUserId(userId || 'anonymous');
    if ((hash % 100) >= flag.rollout) return false;
  }

  // Check segments
  if (flag.segments && flag.segments.length > 0 && userId) {
    // TODO: Check user segments
  }

  return true;
}

/**
 * Get A/B test variant for a feature.
 */
export function getABTestVariant(key: string): 'A' | 'B' | null {
  const flag = cachedFlags[key];
  if (!flag?.abTest) return null;
  return flag.abTest.variant;
}

/**
 * Get all feature flags.
 */
export function getAllFlags(): Record<string, FeatureFlag> {
  return { ...cachedFlags };
}

/**
 * Override a feature flag locally (for development).
 */
export function overrideFlag(key: string, enabled: boolean): void {
  cachedFlags[key] = {
    ...cachedFlags[key],
    enabled,
  };
  localStorage.setItem('presidium-flag-overrides', JSON.stringify(cachedFlags));
}

/**
 * Clear all local overrides.
 */
export function clearFlagOverrides(): void {
  localStorage.removeItem('presidium-flag-overrides');
  loadCachedFlags();
}

// ─── Internal Methods ───────────────────────────────────────────────────────

function loadCachedFlags(): void {
  try {
    const data = localStorage.getItem(FLAGS_CACHE_KEY);
    if (data) {
      const parsed: FeatureFlagsConfig = JSON.parse(data);
      cachedFlags = { ...DEFAULT_FLAGS, ...parsed.flags };
    }
  } catch {
    // Use defaults
  }

  // Apply overrides
  try {
    const overrides = localStorage.getItem('presidium-flag-overrides');
    if (overrides) {
      cachedFlags = { ...cachedFlags, ...JSON.parse(overrides) };
    }
  } catch {
    // Ignore
  }
}

function saveCachedFlags(): void {
  const config: FeatureFlagsConfig = {
    flags: cachedFlags,
    fetchedAt: Date.now(),
    ttl: FLAGS_TTL,
  };
  localStorage.setItem(FLAGS_CACHE_KEY, JSON.stringify(config));
}

function applyLocalOverrides(_userId?: string): void {
  // URL params override
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    for (const key of Object.keys(cachedFlags)) {
      const param = params.get(key);
      if (param === 'true') {
        cachedFlags[key].enabled = true;
      } else if (param === 'false') {
        cachedFlags[key].enabled = false;
      }
    }
  }
}

/**
 * Simple hash function for user ID to determine rollout.
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
