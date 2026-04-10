import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import { callGLM4, GLM4RateLimitError } from '@/lib/glm4';
import { z } from 'zod';

const RECOMMENDER_SYSTEM_PROMPT = `You are OpenClaw — an AI content curator for PRESIDIUM messenger. Based on a user's interest profile, you recommend personalized content for their Feed and Marketplace.

## Feed Recommendations
Suggest relevant articles, news, tutorials, discussions that match the user's interests. Each recommendation should be a content card with title, brief description, and category.

## Marketplace Recommendations
Suggest products, services, or items that align with the user's interests and communication patterns.

## Response Format
Return ONLY valid JSON:
{
  "feedRecommendations": [
    {
      "id": "rec-feed-001",
      "type": "feed",
      "title": "Article/tutorial/discussion title",
      "content": "Brief 2-3 sentence description",
      "category": "Technology|Science|Business|Art|Gaming|Music|News|Health|Education",
      "relevanceScore": 0.95,
      "reason": "Why this is relevant to the user"
    }
  ],
  "marketplaceRecommendations": [
    {
      "id": "rec-market-001",
      "type": "marketplace",
      "title": "Product/service name",
      "description": "Brief description",
      "category": "Electronics|Books|Home|Accessories|Software|Services",
      "estimatedPrice": 0,
      "relevanceScore": 0.9,
      "reason": "Why this matches user interests"
    }
  ],
  "insight": "Brief insight about the user's content needs"
}

Generate 4-6 feed recommendations and 2-4 marketplace recommendations. Be specific and useful.`;

const recommendRequestSchema = z.object({
  profile: z.object({
    interests: z.array(z.string().min(1).max(80)).min(1).max(30),
    keyTopics: z
      .array(
        z.object({
          topic: z.string().min(1).max(80),
          frequency: z.string().min(1).max(20),
        }),
      )
      .max(50)
      .optional()
      .default([]),
    contentPreferences: z
      .object({
        preferredFormats: z.array(z.string().min(1).max(40)).max(30).optional().default([]),
      })
      .optional()
      .default({ preferredFormats: [] }),
    summary: z.string().max(1200).optional().default(''),
  }),
  context: z
    .object({
      currentFeed: z
        .array(z.object({ title: z.string().min(1).max(120), category: z.string().min(1).max(80) }))
        .max(200)
        .optional(),
      currentMarketplace: z
        .array(z.object({ title: z.string().min(1).max(120), category: z.string().min(1).max(80) }))
        .max(200)
        .optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`openclaw-recommend:post:${session.user.id}`, {
      maxRequests: 12,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many recommendation requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parse = recommendRequestSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const { profile, context } = parse.data;

    if (!profile || !profile.interests || profile.interests.length === 0) {
      return NextResponse.json({
        success: true,
        feedRecommendations: [],
        marketplaceRecommendations: [],
        insight: 'No profile data available for recommendations',
      });
    }

    let userPrompt = `Generate personalized content recommendations based on this user profile:\n\n`;
    userPrompt += `## User Profile\n`;
    userPrompt += `**Interests**: ${profile.interests.join(', ')}\n`;

    if (profile.keyTopics && profile.keyTopics.length > 0) {
      userPrompt += `**Key Topics**:\n`;
      profile.keyTopics.forEach((t) => {
        userPrompt += `- ${t.topic} (${t.frequency} frequency)\n`;
      });
    }

    if (profile.contentPreferences?.preferredFormats?.length > 0) {
      userPrompt += `**Preferred Content**: ${profile.contentPreferences.preferredFormats.join(', ')}\n`;
    }

    if (profile.summary) {
      userPrompt += `**Summary**: ${profile.summary}\n`;
    }

    if (context?.currentFeed && context.currentFeed.length > 0) {
      userPrompt += `\n## Content the user already saw (avoid duplicates/similarity)\n`;
      context.currentFeed.slice(0, 10).forEach((item) => {
        userPrompt += `- "${item.title}" (${item.category})\n`;
      });
    }

    userPrompt += '\nGenerate fresh, diverse recommendations not overlapping with existing content.';

    const rawContent = await callGLM4([
      { role: 'system', content: RECOMMENDER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);

    let result: {
      feedRecommendations: Array<Record<string, unknown>>;
      marketplaceRecommendations: Array<Record<string, unknown>>;
      insight: string;
    };

    try {
      const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      result = JSON.parse(cleaned) as typeof result;
    } catch {
      result = {
        feedRecommendations: [],
        marketplaceRecommendations: [],
        insight: 'Failed to generate recommendations',
      };
    }

    // Sanitize feed recommendations
    const feedRecs = (result.feedRecommendations || []).slice(0, 6).map((r, i) => ({
      id: r.id || `rec-feed-${Date.now()}-${i}`,
      type: 'feed' as const,
      title: String(r.title || '').slice(0, 100),
      content: String(r.content || '').slice(0, 300),
      category: String(r.category || 'General'),
      relevanceScore: typeof r.relevanceScore === 'number' ? r.relevanceScore : 0.5,
      reason: String(r.reason || '').slice(0, 150),
    }));

    // Sanitize marketplace recommendations
    const marketRecs = (result.marketplaceRecommendations || []).slice(0, 4).map((r, i) => ({
      id: r.id || `rec-market-${Date.now()}-${i}`,
      type: 'marketplace' as const,
      title: String(r.title || '').slice(0, 100),
      description: String(r.description || '').slice(0, 300),
      category: String(r.category || 'General'),
      estimatedPrice: typeof r.estimatedPrice === 'number' ? r.estimatedPrice : 0,
      relevanceScore: typeof r.relevanceScore === 'number' ? r.relevanceScore : 0.5,
      reason: String(r.reason || '').slice(0, 150),
    }));

    return NextResponse.json({
      success: true,
      feedRecommendations: feedRecs,
      marketplaceRecommendations: marketRecs,
      insight: String(result.insight || '').slice(0, 300),
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

    console.error('[OpenClaw] Recommendation error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
