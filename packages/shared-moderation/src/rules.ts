/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 *
 * Silent Claw — Layer 1: Regex Rules
 *
 * Zero-latency pattern matching для известных нарушений.
 * Обрабатывается синхронно, блокирует сообщение мгновенно.
 */

export interface RegexRule {
  id: string;
  category: 'drugs' | 'fraud' | 'violence' | 'spam' | 'nsfw';
  severity: 'low' | 'medium' | 'high' | 'critical';
  patterns: RegExp[];
  description: string;
  contexts: Array<'message' | 'post' | 'comment' | 'marketplace' | 'username'>;
  action: 'flag' | 'shadow_remove' | 'block';
}

export interface RegexMatch {
  matched: boolean;
  rule?: RegexRule;
  matches: string[];
  position: number;
}

function normalizeText(text: string): string {
  return text
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .normalize('NFKC')
    .replace(/[０𝟎𝟘𝟢🄀⓪]/g, '0')
    .replace(/[１𝟏𝟙𝟣⒈①]/g, '1')
    .replace(/(\S)\s+(\S)/g, '$1$2')
    .toLowerCase();
}

export const ENHANCED_RULES: RegexRule[] = [
  {
    id: 'drugs-001',
    category: 'drugs',
    severity: 'critical',
    patterns: [
      /купить\s*(?:меф|мефедрон|скорость|фен|амф|амфетамин|кокаин|героин|шишки|трав[ау]|марихуан[ау]|грибы|lsd|экстази|мдма|спайс|соль)/i,
      /заклад[кки]\s*(?:меф|мефедрон|скорость|фен|амф|кокаин|героин|шишки|трав[ау]|марихуан[ау]|грибы|lsd|экстази|мдма|спайс)/i,
      /(?:меф|мефедрон|скорость|фен|амф|кокаин|героин)\s*(?:купить|заклад|заказать|доставка)/i,
    ],
    description: 'Drug purchase keywords and dealer contacts',
    contexts: ['message', 'post', 'comment', 'marketplace'],
    action: 'shadow_remove',
  },
  {
    id: 'drugs-002',
    category: 'drugs',
    severity: 'high',
    patterns: [
      /(?:наркотик[иы]|дур[ьм]|трав[кау]|шишки|гриб[ыов]|кислот[аы]|экстаз[иы]|мдма|спайс|соли)/i,
      /(?:дилер|закладчик|курьер|поставщик)\s*(?:нужен|ищу|требуется)/i,
    ],
    description: 'Drug references and dealer recruitment',
    contexts: ['message', 'post', 'comment'],
    action: 'flag',
  },
  {
    id: 'fraud-001',
    category: 'fraud',
    severity: 'high',
    patterns: [
      /выигрыш\s*(?:\d+[кkмm]?\s*руб|\$\d+[кkмm]?)/i,
      /(?:поздравляем|вы\s*выиграли|вы\s*стали\s*победител)/i,
      /(?:переведите|отправьте|заплатите)\s*(?:\d+[кkмm]?)\s*(?:руб|₽|\$)/i,
      /(?:банк|сбербанк|тинькофф|альфа)\s*(?:заблокир|заморож|подозрительн)/i,
      /(?:срочно|незамедлительно)\s*(?:подтвердите|подтверждение)/i,
    ],
    description: 'Fraud, scams, phishing attempts',
    contexts: ['message', 'post', 'comment', 'marketplace'],
    action: 'shadow_remove',
  },
  {
    id: 'fraud-002',
    category: 'fraud',
    severity: 'medium',
    patterns: [
      /(?:заработок|заработать|доход|пассивный\s*доход)\s*(?:\d+[кkмm]?)\s*(?:руб|₽|\$)/i,
      /(?:инвестиции|инвестировать|вложить)\s*(?:\d+[кkмm]?)/i,
      /(?:пирамида|mlm|млм|сетевой\s*маркетинг)/i,
    ],
    description: 'Investment scams and MLM',
    contexts: ['message', 'post', 'marketplace'],
    action: 'flag',
  },
  {
    id: 'violence-001',
    category: 'violence',
    severity: 'critical',
    patterns: [
      /(?:убей|убить|убийство|зарезать|застрелить|расстрел|взорвать|теракт)/i,
      /(?:террорист|терроризм|экстремизм|радикал)/i,
      /(?:нападение|захват|заложник|взрыв|бомб[ау])/i,
    ],
    description: 'Violence, terrorism, extremism',
    contexts: ['message', 'post', 'comment'],
    action: 'shadow_remove',
  },
  {
    id: 'violence-002',
    category: 'violence',
    severity: 'high',
    patterns: [
      /(?:изнасилова|насилие|педофил|детское\s*порно|cp)/i,
    ],
    description: 'Sexual violence and CSAM references',
    contexts: ['message', 'post', 'comment'],
    action: 'block',
  },
  {
    id: 'spam-001',
    category: 'spam',
    severity: 'medium',
    patterns: [
      /(?:подпишись|подписывайся|переходи|кликни|жми\s*сюда)/i,
      /(?:реклама|продвижение|раскрутка|smm)/i,
      /(?:бесплатно|даром|в\s*подарок)\s*(?:только\s*сегодня)/i,
    ],
    description: 'Spam and engagement bait',
    contexts: ['message', 'post', 'comment'],
    action: 'flag',
  },
  {
    id: 'nsfw-001',
    category: 'nsfw',
    severity: 'medium',
    patterns: [
      /(?:порно|порнография|эротика|голые|ню|18\+|только\s*для\s*взрослых)/i,
    ],
    description: 'Adult content in public channels',
    contexts: ['post', 'comment'],
    action: 'flag',
  },
];

const severityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function runRegexCheck(
  text: string,
  context: 'message' | 'post' | 'comment' | 'marketplace' | 'username' = 'message'
): RegexMatch {
  const normalized = normalizeText(text);
  let bestMatch: RegexMatch = { matched: false, matches: [], position: -1 };
  let highestSeverity = -1;

  for (const rule of ENHANCED_RULES) {
    if (!rule.contexts.includes(context)) continue;
    for (const pattern of rule.patterns) {
      const matches: string[] = [];
      let match;
      while ((match = pattern.exec(normalized)) !== null) {
        matches.push(match[0]);
        if (match.index === pattern.lastIndex) pattern.lastIndex++;
      }
      pattern.lastIndex = 0;
      if (matches.length > 0) {
        const sev = severityOrder[rule.severity];
        if (sev > highestSeverity) {
          highestSeverity = sev;
          bestMatch = { matched: true, rule, matches, position: normalized.indexOf(matches[0]) };
        }
      }
    }
  }
  return bestMatch;
}

export function quickRegexCheck(
  text: string,
  context: 'message' | 'post' | 'comment' | 'marketplace' | 'username' = 'message'
): boolean {
  const normalized = normalizeText(text);
  for (const rule of ENHANCED_RULES) {
    if (!rule.contexts.includes(context)) continue;
    if (rule.severity !== 'critical') continue;
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) { pattern.lastIndex = 0; return true; }
      pattern.lastIndex = 0;
    }
  }
  return false;
}

export function getRulesByCategory(category: RegexRule['category']): RegexRule[] {
  return ENHANCED_RULES.filter(r => r.category === category);
}

export function addCustomRule(rule: RegexRule): void { ENHANCED_RULES.push(rule); }

export function removeRule(ruleId: string): boolean {
  const index = ENHANCED_RULES.findIndex(r => r.id === ruleId);
  if (index >= 0) { ENHANCED_RULES.splice(index, 1); return true; }
  return false;
}
