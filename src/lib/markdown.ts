/**
 * Rich Text Formatting Module
 *
 * Features:
 * - Markdown parsing (bold, italic, strikethrough, code, quote)
 * - Code blocks with syntax highlighting
 * - @user mentions
 * - #hashtags
 * - Auto-link detection
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormattedSegment {
  type: 'text' | 'bold' | 'italic' | 'strikethrough' | 'code' | 'codeblock' | 'quote' | 'mention' | 'hashtag' | 'link';
  content: string;
  href?: string;
  userId?: string;
  language?: string;
}

// ─── Markdown Parser ─────────────────────────────────────────────────────────

/**
 * Parse markdown text into formatted segments.
 */
export function parseMarkdown(text: string): FormattedSegment[] {
  const segments: FormattedSegment[] = [];
  let lastIndex = 0;

  // Process code blocks first (```)
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(...parseInline(text.slice(lastIndex, match.index)));
    }
    segments.push({
      type: 'codeblock',
      content: match[2].trim(),
      language: match[1] || undefined,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(...parseInline(text.slice(lastIndex)));
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

/**
 * Parse inline markdown (bold, italic, code, mentions, links).
 */
function parseInline(text: string): FormattedSegment[] {
  const segments: FormattedSegment[] = [];

  // Collect inline code matches
  const codeMatches: { start: number; end: number; content: string }[] = [];
  const codeRegex = /`([^`]+)`/g;
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = codeRegex.exec(text)) !== null) {
    codeMatches.push({
      start: codeMatch.index,
      end: codeMatch.index + codeMatch[0].length,
      content: codeMatch[1],
    });
  }

  // Split text by code blocks
  let pos = 0;
  for (const codeMatch of codeMatches) {
    if (codeMatch.start > pos) {
      segments.push(...parseFormatting(text.slice(pos, codeMatch.start)));
    }
    segments.push({ type: 'code', content: codeMatch.content });
    pos = codeMatch.end;
  }

  if (pos < text.length) {
    segments.push(...parseFormatting(text.slice(pos)));
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

/**
 * Parse formatting (bold, italic, strikethrough, mentions, hashtags, links).
 */
function parseFormatting(text: string): FormattedSegment[] {
  const segments: FormattedSegment[] = [];

  const patterns: Array<{ regex: RegExp; type: FormattedSegment['type']; group: number }> = [
    { regex: /\*\*(.+?)\*\*|__(.+?)__/g, type: 'bold', group: 1 },
    { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, type: 'italic', group: 1 },
    { regex: /~~(.+?)~~/g, type: 'strikethrough', group: 1 },
    { regex: /@(\w+)/g, type: 'mention', group: 1 },
    { regex: /#(\w+)/g, type: 'hashtag', group: 1 },
    { regex: /(https?:\/\/[^\s<]+)/g, type: 'link', group: 1 },
  ];

  const allMatches: Array<{ start: number; end: number; type: FormattedSegment['type']; content: string; href?: string }> = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const content = m[pattern.group] || m[0];
      allMatches.push({
        start: m.index,
        end: m.index + m[0].length,
        type: pattern.type,
        content,
        href: pattern.type === 'link' ? content : pattern.type === 'mention' ? `/user/${content.slice(1)}` : undefined,
      });
    }
  }

  allMatches.sort((a, b) => a.start - b.start);

  const filtered = allMatches.filter((m, i, arr) => {
    if (i === 0) return true;
    return m.start >= arr[i - 1].end;
  });

  let pos = 0;
  for (const m of filtered) {
    if (m.start > pos) {
      segments.push({ type: 'text', content: text.slice(pos, m.start) });
    }
    segments.push({
      type: m.type,
      content: m.content,
      href: m.href,
      userId: m.type === 'mention' ? m.content.slice(1) : undefined,
    });
    pos = m.end;
  }

  if (pos < text.length) {
    segments.push({ type: 'text', content: text.slice(pos) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

// ─── Quote Parser ────────────────────────────────────────────────────────────

export function parseQuotes(text: string): { type: 'quote' | 'text'; content: string }[] {
  const lines = text.split('\n');
  const blocks: { type: 'quote' | 'text'; content: string }[] = [];
  let currentBlock: { type: 'quote' | 'text'; content: string } | null = null;

  for (const line of lines) {
    const isQuote = line.startsWith('> ');
    const content = isQuote ? line.slice(2) : line;

    if (currentBlock && currentBlock.type === (isQuote ? 'quote' : 'text')) {
      currentBlock.content += '\n' + content;
    } else {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { type: isQuote ? 'quote' : 'text', content };
    }
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

// ─── Mention/Hashtag Detection ───────────────────────────────────────────────

export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  const regex = /@(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    mentions.push(m[1]);
  }
  return [...new Set(mentions)];
}

export function extractHashtags(text: string): string[] {
  const hashtags: string[] = [];
  const regex = /#(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    hashtags.push(m[1]);
  }
  return [...new Set(hashtags)];
}
