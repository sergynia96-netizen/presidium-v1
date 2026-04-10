'use client';

import { useMemo, useState } from 'react';
import { Brain, Loader2, ShieldCheck, ShieldAlert, Sparkles, ShoppingBag, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';

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

interface FeedRecommendation {
  id: string;
  title: string;
  content: string;
  category: string;
  reason: string;
}

interface MarketRecommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  estimatedPrice: number;
  reason: string;
}

export default function OpenClawPanel() {
  const messagesByChat = useAppStore((s) => s.messages);
  const moderationResults = useAppStore((s) => s.moderationResults);

  const [buildingProfile, setBuildingProfile] = useState(false);
  const [buildingRecs, setBuildingRecs] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [feedRecs, setFeedRecs] = useState<FeedRecommendation[]>([]);
  const [marketRecs, setMarketRecs] = useState<MarketRecommendation[]>([]);
  const [insight, setInsight] = useState('');
  const [error, setError] = useState<string | null>(null);

  const allMessageTexts = useMemo(() => {
    const list: Array<{ text: string; timestamp?: string; chatName?: string }> = [];
    for (const [chatId, chatMessages] of Object.entries(messagesByChat)) {
      for (const msg of chatMessages) {
        if (msg.type === 'system') continue;
        list.push({
          text: msg.content,
          timestamp: msg.timestamp,
          chatName: chatId,
        });
      }
    }
    return list.slice(-240);
  }, [messagesByChat]);

  const moderationStats = useMemo(() => {
    const values = Object.values(moderationResults);
    const flagged = values.filter((m) => !m.isSafe).length;
    const blocked = values.filter((m) => m.riskLevel === 'high' || m.riskLevel === 'critical').length;
    return {
      checked: values.length,
      flagged,
      blocked,
    };
  }, [moderationResults]);

  const buildProfile = async () => {
    setBuildingProfile(true);
    setError(null);
    try {
      const res = await fetch('/api/openclaw/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessageTexts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to build profile');
      }
      setProfile(data.profile || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build profile');
    } finally {
      setBuildingProfile(false);
    }
  };

  const buildRecommendations = async () => {
    if (!profile) return;
    setBuildingRecs(true);
    setError(null);
    try {
      const res = await fetch('/api/openclaw/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to build recommendations');
      }
      setFeedRecs(data.feedRecommendations || []);
      setMarketRecs(data.marketplaceRecommendations || []);
      setInsight(data.insight || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build recommendations');
    } finally {
      setBuildingRecs(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <ShieldCheck className="size-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">OpenClaw Admin</h2>
          <p className="text-xs text-muted-foreground">Local moderation and recommendations</p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
          <Card className="border-border/50 py-0">
            <CardContent className="grid grid-cols-3 gap-3 p-4">
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Checked</p>
                <p className="text-lg font-semibold">{moderationStats.checked}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Flagged</p>
                <p className="text-lg font-semibold text-amber-500">{moderationStats.flagged}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Blocked</p>
                <p className="text-lg font-semibold text-destructive">{moderationStats.blocked}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 py-0">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Interest Profile</p>
                  <p className="text-xs text-muted-foreground">Built from local chat history</p>
                </div>
                <Button size="sm" variant="outline" onClick={buildProfile} disabled={buildingProfile}>
                  {buildingProfile ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Brain className="mr-1 size-3" />}
                  Build
                </Button>
              </div>

              {profile && (
                <div className="space-y-2">
                  {profile.summary && <p className="text-xs text-muted-foreground">{profile.summary}</p>}
                  {profile.interests?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.interests.map((interest) => (
                        <Badge key={interest} variant="secondary" className="text-[11px]">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {profile.keyTopics?.length > 0 && (
                    <div className="space-y-1">
                      {profile.keyTopics.slice(0, 6).map((topic) => (
                        <p key={topic.topic} className="text-[11px] text-muted-foreground">
                          {topic.topic}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 py-0">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Recommendations</p>
                  <p className="text-xs text-muted-foreground">For Feed and Marketplace</p>
                </div>
                <Button size="sm" variant="outline" onClick={buildRecommendations} disabled={!profile || buildingRecs}>
                  {buildingRecs ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Sparkles className="mr-1 size-3" />}
                  Generate
                </Button>
              </div>

              {insight && <p className="text-xs text-muted-foreground">{insight}</p>}

              {feedRecs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <MessageSquare className="size-3" />
                    Feed
                  </div>
                  {feedRecs.slice(0, 4).map((rec) => (
                    <div key={rec.id} className="rounded-xl border border-border/50 p-2.5">
                      <p className="text-xs font-medium">{rec.title}</p>
                      <p className="text-[11px] text-muted-foreground">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {marketRecs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <ShoppingBag className="size-3" />
                    Marketplace
                  </div>
                  {marketRecs.slice(0, 4).map((rec) => (
                    <div key={rec.id} className="rounded-xl border border-border/50 p-2.5">
                      <p className="text-xs font-medium">{rec.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {rec.reason}
                        {rec.estimatedPrice > 0 ? ` · $${rec.estimatedPrice}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <ShieldAlert className="size-3.5" />
              {error}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
