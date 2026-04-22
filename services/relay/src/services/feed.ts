interface ScoreParams {
  authorStrikes?: number;
  authorAge?: number;
  hasMedia?: boolean;
  contentLength?: number;
  isRepost?: boolean;
  engagementVelocity?: number;
}

export function calculateFeedScore(params: ScoreParams): number {
  let score = 100;

  if (params.authorStrikes) {
    score -= params.authorStrikes * 50;
  }

  if (params.authorAge) {
    const daysOld = params.authorAge / (1000 * 60 * 60 * 24);
    score += Math.min(daysOld * 0.5, 20);
  }

  if (params.hasMedia) {
    score += 15;
  }

  if (params.contentLength) {
    if (params.contentLength > 100 && params.contentLength < 2000) {
      score += 10;
    } else if (params.contentLength > 5000) {
      score -= 10;
    }
  }

  if (params.isRepost) {
    score *= 0.7;
  }

  if (params.engagementVelocity) {
    score += params.engagementVelocity * 10;
  }

  return Math.max(0, Math.round(score));
}
