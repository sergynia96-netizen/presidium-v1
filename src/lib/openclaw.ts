import { ModerationResult } from '@/types';

export interface OpenClawAPIResponse {
  isSafe: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
  warning: string | null;
  originalMessage: string;
  suggestedAction: string | null;
  flags?: Array<{ category: string; severity: 'low' | 'medium' | 'high'; description: string }>;
  blocked?: boolean;
}

const OFFLINE_RULES = [
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

export function runLocalOpenClaw(text: string): OpenClawAPIResponse {
  const normalized = text.trim();
  if (!normalized) {
    return { isSafe: true, riskLevel: 'none', categories: [], warning: null, originalMessage: text, suggestedAction: null, flags: [], blocked: false };
  }

  const flags = OFFLINE_RULES.filter(rule => rule.regex.test(normalized)).map(rule => ({
    category: rule.category,
    severity: rule.severity as 'low' | 'medium' | 'high',
    description: rule.description,
  }));

  const isSafe = flags.length === 0;
  const riskLevel = isSafe ? 'none' : flags.some(f => f.severity === 'high') ? 'critical' : 'medium';
  const blocked = flags.some(f => f.severity === 'high');

  return {
    isSafe,
    riskLevel,
    categories: flags.map(f => f.category),
    warning: isSafe ? null : flags[0].description,
    originalMessage: text,
    suggestedAction: null,
    flags,
    blocked,
  };
}

/**
 * Map category to i18n key
 */
export function getCategoryKey(category: string): string {
  const map: Record<string, string> = {
    fraud: 'openclaw.fraud',
    terrorism: 'openclaw.terrorism',
    extremism: 'openclaw.cat.extremism',
    fascism: 'openclaw.cat.fascism',
    drug_business: 'openclaw.cat.drug_business',
    pornography: 'openclaw.cat.pornography',
    violence: 'openclaw.violence',
    nsfw: 'openclaw.nsfw',
    personal_info: 'openclaw.personalInfo',
    drugs: 'openclaw.drugs',
  };
  return map[category] || category;
}

/**
 * Map risk level to color classes
 */
export function getRiskColorClasses(
  riskLevel: ModerationResult['riskLevel']
): {
  bg: string;
  border: string;
  text: string;
  badge: string;
  animate?: string;
} {
  switch (riskLevel) {
    case 'low':
      return {
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        border: 'border-amber-200 dark:border-amber-500/30',
        text: 'text-amber-700 dark:text-amber-400',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
      };
    case 'medium':
      return {
        bg: 'bg-orange-50 dark:bg-orange-500/10',
        border: 'border-orange-200 dark:border-orange-500/30',
        text: 'text-orange-700 dark:text-orange-400',
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
      };
    case 'high':
      return {
        bg: 'bg-red-50 dark:bg-red-500/10',
        border: 'border-red-200 dark:border-red-500/30',
        text: 'text-red-700 dark:text-red-400',
        badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
      };
    case 'critical':
      return {
        bg: 'bg-red-50 dark:bg-red-500/10',
        border: 'border-red-300 dark:border-red-500/40',
        text: 'text-red-700 dark:text-red-400',
        badge: 'bg-red-200 text-red-800 dark:bg-red-500/30 dark:text-red-300',
        animate: 'animate-pulse',
      };
    default:
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
        border: 'border-emerald-200 dark:border-emerald-500/30',
        text: 'text-emerald-700 dark:text-emerald-400',
        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
      };
  }
}

/**
 * Map risk level to i18n key
 */
export function getRiskLevelKey(riskLevel: ModerationResult['riskLevel']): string {
  const map: Record<string, string> = {
    none: 'openclaw.safe',
    low: 'openclaw.riskLow',
    medium: 'openclaw.riskMedium',
    high: 'openclaw.riskHigh',
    critical: 'openclaw.riskCritical',
  };
  return map[riskLevel] || 'openclaw.safe';
}
