import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import { callGLM4, GLM4RateLimitError } from '@/lib/glm4';
import { z } from 'zod';

const PROFILER_SYSTEM_PROMPT = `You are OpenClaw — an AI profiler that analyzes user communication patterns to build an interest profile for personalized content recommendations.

Given a collection of messages from a user's chats, analyze and extract:

1. **Interests** — topics the user discusses frequently (technology, sports, music, science, business, art, gaming, etc.)
2. **Tone** — communication style (formal, casual, humorous, technical, emotional)
3. **Languages** — languages used in communication
4. **Active hours** — when the user is most communicative
5. **Key topics** — the 5-10 most frequently discussed subjects
6. **Content preferences** — what type of content the user engages with (articles, memes, tutorials, news, opinions)

## Response Format
Return ONLY valid JSON:
{
  "interests": ["topic1", "topic2", ...],
  "tone": "description of communication style",
  "languages": ["en", "ru", ...],
  "keyTopics": [
    { "topic": "topic name", "frequency": "high|medium|low", "keywords": ["kw1", "kw2"] }
  ],
  "contentPreferences": {
    "preferredFormats": ["articles", "tutorials", ...],
    "engagementStyle": "active|passive|mixed"
  },
  "summary": "Brief 1-2 sentence user profile summary"
}

If insufficient data, return: { "interests": [], "summary": "Insufficient data to build profile" }`;

interface KeyTopic {
  topic: string;
  frequency: 'high' | 'medium' | 'low';
  keywords: string[];
}

interface UserProfile {
  interests: string[];
  tone: string;
  languages: string[];
  keyTopics: KeyTopic[];
  contentPreferences: {
    preferredFormats: string[];
    engagementStyle: string;
  };
  summary: string;
}

const profileMessageSchema = z.object({
  text: z.string().min(1).max(4000),
  timestamp: z.string().max(100).optional(),
  chatName: z.string().max(120).optional(),
});

const profileChatSummarySchema = z.object({
  chatName: z.string().min(1).max(120),
  messageCount: z.number().int().min(0).max(10_000_000),
  lastActive: z.string().min(1).max(120),
});

const profileRequestSchema = z
  .object({
    messages: z.array(profileMessageSchema).max(1000).optional(),
    chatSummaries: z.array(profileChatSummarySchema).max(500).optional(),
  })
  .refine((data) => (data.messages?.length || 0) > 0 || (data.chatSummaries?.length || 0) > 0, {
    message: 'messages or chatSummaries must be provided',
  });

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`openclaw-profile:post:${session.user.id}`, {
      maxRequests: 12,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many profile analysis requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parse = profileRequestSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const { messages, chatSummaries } = parse.data;

    // Need at least some data to analyze
    const hasMessages = messages && messages.length > 0;
    const hasSummaries = chatSummaries && chatSummaries.length > 0;

    if (!hasMessages && !hasSummaries) {
      return NextResponse.json({
        success: true,
        profile: {
          interests: [],
          tone: '',
          languages: [],
          keyTopics: [],
          contentPreferences: { preferredFormats: [], engagementStyle: 'unknown' },
          summary: 'Insufficient data to build profile',
        },
      });
    }

    let userPrompt = 'Analyze the following user communication data to build an interest profile:\n\n';

    if (hasMessages) {
      // Limit to last 100 messages for context window
      const recentMessages = (messages || []).slice(-100);
      userPrompt += '## Recent Messages\n';
      recentMessages.forEach((msg, i) => {
        userPrompt += `${i + 1}. ${msg.text}\n`;
        if (msg.chatName) userPrompt += `   (from chat: ${msg.chatName})\n`;
        if (msg.timestamp) userPrompt += `   (time: ${msg.timestamp})\n`;
      });
    }

    if (hasSummaries) {
      userPrompt += '\n## Chat Activity Summary\n';
      (chatSummaries || []).forEach((s) => {
        userPrompt += `- "${s.chatName}": ${s.messageCount} messages, last active ${s.lastActive}\n`;
      });
    }

    userPrompt += '\nBuild a comprehensive interest profile from this data.';

    const rawContent = await callGLM4([
      { role: 'system', content: PROFILER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);

    let profile: UserProfile;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      profile = JSON.parse(cleaned) as UserProfile;
    } catch {
      profile = {
        interests: [],
        tone: '',
        languages: [],
        keyTopics: [],
        contentPreferences: { preferredFormats: [], engagementStyle: 'unknown' },
        summary: 'Failed to parse profile data',
      };
    }

    // Validate structure
    profile.interests = Array.isArray(profile.interests) ? profile.interests.slice(0, 20) : [];
    profile.languages = Array.isArray(profile.languages) ? profile.languages : [];
    profile.keyTopics = Array.isArray(profile.keyTopics)
      ? profile.keyTopics.slice(0, 10).map((t: KeyTopic) => ({
          topic: String(t.topic || '').slice(0, 50),
          frequency: ['high', 'medium', 'low'].includes(t.frequency) ? t.frequency : 'low',
          keywords: Array.isArray(t.keywords) ? t.keywords.slice(0, 5) : [],
        }))
      : [];

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error: unknown) {
    if (error instanceof GLM4RateLimitError) {
      return NextResponse.json(
        { error: 'GLM-4 rate limit exceeded', retryAfterMs: error.retryAfterMs },
        { status: 429 },
      );
    }

    if (
      error instanceof Error &&
      /GLM4_API_KEY|missing or placeholder/i.test(error.message)
    ) {
      return NextResponse.json(
        {
          error:
            'AI provider is not configured. Set GLM4_API_KEY in .env.local and restart the app.',
        },
        { status: 503 },
      );
    }

    console.error('[OpenClaw] Profile analysis error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
