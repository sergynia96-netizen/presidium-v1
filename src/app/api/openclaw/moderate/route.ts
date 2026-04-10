import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { z } from 'zod';
import { callGLM4JSON, type GLM4Message } from '@/lib/glm4';
import { rateLimit } from '@/lib/rate-limit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

type Severity = 'low' | 'medium' | 'high';
type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

interface ModerationFlag {
  category: string;
  severity: Severity;
  description: string;
}

interface OpenClawResult {
  moderated: boolean;
  flags: ModerationFlag[];
  blocked: boolean;
  suggestion: string | null;
}

const VALID_CATEGORIES = [
  'extremism',
  'terrorism',
  'fascism',
  'drug_business',
  'violence',
  'pornography',
  'fraud',
  'banditism',
  'murder',
  'criminal_activity',
  // Backward-compatible aliases
  'nsfw',
  'drugs',
  'personal_info',
] as const;

const VALID_SEVERITIES: Severity[] = ['low', 'medium', 'high'];

const OPENCLAW_MODERATION_PROMPT = `You are OpenClaw, a strict safety moderator for PRESIDIUM messenger.

Analyze the message and classify violations in these categories:
1) extremism
2) terrorism
3) fascism
4) drug_business
5) violence
6) pornography
7) fraud
8) banditism
9) murder
10) criminal_activity

Rules:
- If no violations: moderated=false, blocked=false, flags=[]
- If any high-severity flag exists: blocked=true
- Suggestion is allowed only when blocked=false
- Return JSON only.

JSON schema:
{
  "moderated": boolean,
  "flags": [
    {
      "category": "extremism|terrorism|fascism|drug_business|violence|pornography|fraud|banditism|murder|criminal_activity",
      "severity": "low|medium|high",
      "description": "short explanation"
    }
  ],
  "blocked": boolean,
  "suggestion": "string or null"
}`;

const requestSchema = z.object({
  // New format
  text: z.string().min(1).max(10000).optional(),
  messageId: z.string().optional(),
  chatContext: z.array(z.string()).optional(),
  // Backward-compatible format
  message: z.string().min(1).max(10000).optional(),
  context: z.string().optional(),
});

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;

async function getZAI() {
  if (zaiInstance) return zaiInstance;
  if (!zaiPromise) {
    zaiPromise = ZAI.create();
    zaiPromise
      .then((inst) => {
        zaiInstance = inst;
        zaiPromise = null;
      })
      .catch(() => {
        zaiPromise = null;
      });
  }
  return zaiPromise;
}

function getAIProvider(): 'glm4' | 'zai' {
  return (process.env.AI_PROVIDER as 'glm4' | 'zai') || 'glm4';
}

function riskFromFlags(flags: ModerationFlag[]): RiskLevel {
  if (!flags.length) return 'none';
  if (flags.some((f) => f.severity === 'high')) return 'critical';
  if (flags.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

function toWarning(flags: ModerationFlag[]): string | null {
  if (!flags.length) return null;
  return flags[0]?.description || 'Potentially unsafe content detected';
}

const OFFLINE_RULES: Array<{ category: ModerationFlag['category']; regex: RegExp; severity: Severity; description: string }> = [
  { category: 'extremism', regex: /\b(extremis|radicali[sz]e|hate group)\b/i, severity: 'high', description: 'Extremist indicators found' },
  { category: 'terrorism', regex: /\b(terroris|bomb making|ieds?|suicide attack)\b/i, severity: 'high', description: 'Terrorism indicators found' },
  { category: 'fascism', regex: /\b(fascis|nazi propaganda|heil hitler)\b/i, severity: 'high', description: 'Fascist propaganda indicators found' },
  { category: 'drug_business', regex: /\b(drug trafficking|sell drugs|cocaine for sale|meth lab)\b/i, severity: 'high', description: 'Drug trade indicators found' },
  { category: 'violence', regex: /\b(mass shooting|kill them|how to attack)\b/i, severity: 'high', description: 'Violence indicators found' },
  { category: 'pornography', regex: /\b(child porn|non-consensual porn|revenge porn)\b/i, severity: 'high', description: 'Prohibited sexual content indicators found' },
  { category: 'fraud', regex: /\b(credit card scam|phishing kit|wire fraud)\b/i, severity: 'high', description: 'Fraud indicators found' },
  { category: 'banditism', regex: /\b(armed robbery|carjacking|home invasion)\b/i, severity: 'high', description: 'Banditism indicators found' },
  { category: 'murder', regex: /\b(how to murder|hire a hitman|murder plan)\b/i, severity: 'high', description: 'Murder indicators found' },
  { category: 'criminal_activity', regex: /\b(money laundering|human trafficking|organized crime)\b/i, severity: 'high', description: 'Criminal activity indicators found' },
];

function offlineModeration(text: string): ModerationFlag[] {
  const normalized = text.trim();
  if (!normalized) return [];
  return OFFLINE_RULES.filter((rule) => rule.regex.test(normalized)).map((rule) => ({
    category: rule.category,
    severity: rule.severity,
    description: rule.description,
  }));
}

async function moderateWithAI(messages: GLM4Message[]): Promise<OpenClawResult> {
  const provider = getAIProvider();

  if (provider === 'glm4') {
    return callGLM4JSON<OpenClawResult>(messages);
  }

  const zai = await getZAI();
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  });

  const raw = completion.choices[0]?.message?.content || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON in moderation response');
  }
  return JSON.parse(jsonMatch[0]) as OpenClawResult;
}

export async function POST(request: NextRequest) {
  let messageId: string | null = null;
  let textForFallback = '';
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parse = requestSchema.safeParse(await request.json());
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const text = parse.data.text ?? parse.data.message ?? '';
    textForFallback = text;
    messageId = parse.data.messageId ?? null;
    const chatContext =
      parse.data.chatContext && parse.data.chatContext.length > 0
        ? parse.data.chatContext.slice(-8)
        : parse.data.context
          ? [parse.data.context]
          : [];

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
    const limit = rateLimit(`openclaw:${session.user.id}:${ip}`, {
      maxRequests: 24,
      windowMs: 10000,
    });

    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many moderation requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    if (text.trim().length < 3) {
      return NextResponse.json({
        success: true,
        moderated: false,
        blocked: false,
        flags: [],
        suggestion: null,
        messageId,
        // Backward-compatible fields
        isSafe: true,
        riskLevel: 'none',
        categories: [],
        warning: null,
        suggestedAction: null,
      });
    }

    let userPrompt = `Message:\n"${text.trim()}"`;
    if (chatContext.length) {
      userPrompt += `\n\nRecent context:\n${chatContext.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
    }
    if (messageId) {
      userPrompt += `\n\nMessage ID: ${messageId}`;
    }

    const raw = await moderateWithAI([
      { role: 'system', content: OPENCLAW_MODERATION_PROMPT },
      { role: 'user', content: userPrompt },
    ]);

    const flags: ModerationFlag[] = Array.isArray(raw.flags)
      ? raw.flags
          .filter(
            (f) =>
              !!f &&
              typeof f.category === 'string' &&
              VALID_CATEGORIES.includes(f.category as (typeof VALID_CATEGORIES)[number]) &&
              VALID_SEVERITIES.includes(f.severity as Severity),
          )
          .map((f) => ({
            category: f.category,
            severity: f.severity as Severity,
            description:
              typeof f.description === 'string'
                ? f.description.slice(0, 220)
                : 'Policy violation detected',
          }))
      : [];

    const moderated = flags.length > 0;
    const blocked = moderated && (raw.blocked || flags.some((f) => f.severity === 'high'));
    const suggestion =
      !blocked && typeof raw.suggestion === 'string' && raw.suggestion.trim()
        ? raw.suggestion.trim().slice(0, 500)
        : null;

    const riskLevel = riskFromFlags(flags);
    const categories = flags.map((f) => f.category);
    const warning = toWarning(flags);

    return NextResponse.json({
      success: true,
      moderated,
      blocked,
      flags,
      suggestion,
      messageId,
      // Backward-compatible fields
      isSafe: !moderated,
      riskLevel,
      categories,
      warning,
      suggestedAction: suggestion,
    });
  } catch (error: unknown) {
    console.error('[OpenClaw] Moderation error:', error);
    const flags = offlineModeration(textForFallback);
    const moderated = flags.length > 0;
    const blocked = moderated && flags.some((f) => f.severity === 'high');
    const riskLevel = moderated ? riskFromFlags(flags) : 'low';
    const warning = moderated
      ? toWarning(flags)
      : 'AI moderation unavailable. OpenClaw switched to offline heuristic mode.';

    return NextResponse.json({
      success: false,
      moderated,
      blocked,
      flags,
      suggestion: null,
      messageId,
      // Backward-compatible fields
      isSafe: !moderated,
      riskLevel,
      categories: moderated ? flags.map((f) => f.category) : ['offline_fallback'],
      warning,
      suggestedAction: null,
    });
  }
}
