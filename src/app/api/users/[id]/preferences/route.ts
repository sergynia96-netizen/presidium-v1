import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const privacyLevelSchema = z.enum(['everyone', 'contacts', 'nobody']);

const settingsSchema = z.object({
  desktopNotif: z.boolean().optional(),
  taskbarAnim: z.boolean().optional(),
  sound: z.boolean().optional(),
  notifPrivate: z.boolean().optional(),
  notifChannels: z.boolean().optional(),
  notifGroups: z.boolean().optional(),
  notifNewUser: z.boolean().optional(),
  notifPinned: z.boolean().optional(),
  notifCalls: z.boolean().optional(),
  notifPreview: z.boolean().optional(),
  notifVibration: z.boolean().optional(),
  notifMutedAll: z.boolean().optional(),
  openClawEnabled: z.boolean().optional(),
  autoDelete: z.string().min(1).max(40).optional(),
  readReceipts: z.boolean().optional(),
  typingIndicators: z.boolean().optional(),
  onlineStatus: z.boolean().optional(),
  privacyLastSeen: privacyLevelSchema.optional(),
  privacyProfilePhoto: privacyLevelSchema.optional(),
  privacyAbout: privacyLevelSchema.optional(),
  privacyGroupAdds: privacyLevelSchema.optional(),
  privacyCallFrom: privacyLevelSchema.optional(),
});

const patchSchema = z.object({
  locale: z.enum(['en', 'ru']).optional(),
  accentColor: z.string().min(1).max(40).optional(),
  settings: settingsSchema.optional(),
});

const settingsSelect = {
  desktopNotif: true,
  taskbarAnim: true,
  sound: true,
  notifPrivate: true,
  notifChannels: true,
  notifGroups: true,
  notifNewUser: true,
  notifPinned: true,
  notifCalls: true,
  notifPreview: true,
  notifVibration: true,
  notifMutedAll: true,
  openClawEnabled: true,
  autoDelete: true,
  readReceipts: true,
  typingIndicators: true,
  onlineStatus: true,
  privacyLastSeen: true,
  privacyProfilePhoto: true,
  privacyAbout: true,
  privacyGroupAdds: true,
  privacyCallFrom: true,
  locale: true,
  accentColor: true,
} as const;

function sanitizeSettings(
  raw: {
    desktopNotif: boolean;
    taskbarAnim: boolean;
    sound: boolean;
    notifPrivate: boolean;
    notifChannels: boolean;
    notifGroups: boolean;
    notifNewUser: boolean;
    notifPinned: boolean;
    notifCalls: boolean;
    notifPreview: boolean;
    notifVibration: boolean;
    notifMutedAll: boolean;
    openClawEnabled: boolean;
    autoDelete: string;
    readReceipts: boolean;
    typingIndicators: boolean;
    onlineStatus: boolean;
    privacyLastSeen: string;
    privacyProfilePhoto: string;
    privacyAbout: string;
    privacyGroupAdds: string;
    privacyCallFrom: string;
  },
) {
  const toPrivacyLevel = (value: string, fallback: 'everyone' | 'contacts' | 'nobody') => {
    if (value === 'everyone' || value === 'contacts' || value === 'nobody') {
      return value;
    }
    return fallback;
  };

  return {
    ...raw,
    privacyLastSeen: toPrivacyLevel(raw.privacyLastSeen, 'contacts'),
    privacyProfilePhoto: toPrivacyLevel(raw.privacyProfilePhoto, 'contacts'),
    privacyAbout: toPrivacyLevel(raw.privacyAbout, 'everyone'),
    privacyGroupAdds: toPrivacyLevel(raw.privacyGroupAdds, 'contacts'),
    privacyCallFrom: toPrivacyLevel(raw.privacyCallFrom, 'everyone'),
    // OpenClaw moderation is mandatory.
    openClawEnabled: true,
  };
}

function defaultSettings() {
  return sanitizeSettings({
    desktopNotif: true,
    taskbarAnim: false,
    sound: true,
    notifPrivate: true,
    notifChannels: true,
    notifGroups: true,
    notifNewUser: false,
    notifPinned: false,
    notifCalls: true,
    notifPreview: true,
    notifVibration: true,
    notifMutedAll: false,
    openClawEnabled: true,
    autoDelete: 'Off',
    readReceipts: true,
    typingIndicators: true,
    onlineStatus: true,
    privacyLastSeen: 'contacts',
    privacyProfilePhoto: 'contacts',
    privacyAbout: 'everyone',
    privacyGroupAdds: 'contacts',
    privacyCallFrom: 'everyone',
  });
}

/**
 * GET /api/users/[id]/preferences - get user preferences
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userSettings = await db.userSettings.findUnique({
      where: { userId: id },
      select: settingsSelect,
    });

    if (!userSettings) {
      return NextResponse.json({
        locale: 'en',
        accentColor: 'emerald',
        settings: defaultSettings(),
      });
    }

    const { locale, accentColor, ...rawSettings } = userSettings;
    return NextResponse.json({
      locale: locale || 'en',
      accentColor: accentColor || 'emerald',
      settings: sanitizeSettings(rawSettings),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

/**
 * PATCH /api/users/[id]/preferences - update user preferences
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const patchLimit = rateLimit(`users:preferences:${session.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!patchLimit.success) {
      return NextResponse.json({ error: 'Too many preferences updates' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const locale = parsed.data.locale;
    const accentColor = parsed.data.accentColor;
    const settings = parsed.data.settings || {};

    const upsertData = {
      ...(locale ? { locale } : {}),
      ...(accentColor ? { accentColor } : {}),
      ...(Object.keys(settings).length
        ? {
            ...settings,
            // OpenClaw moderation is mandatory.
            openClawEnabled: true,
          }
        : {}),
    };

    const updated = await db.userSettings.upsert({
      where: { userId: id },
      create: {
        userId: id,
        ...defaultSettings(),
        locale: locale || 'en',
        accentColor: accentColor || 'emerald',
        ...settings,
        openClawEnabled: true,
      },
      update: upsertData,
      select: settingsSelect,
    });

    const { locale: nextLocale, accentColor: nextAccentColor, ...rawSettings } = updated;
    return NextResponse.json({
      success: true,
      locale: nextLocale || 'en',
      accentColor: nextAccentColor || 'emerald',
      settings: sanitizeSettings(rawSettings),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
