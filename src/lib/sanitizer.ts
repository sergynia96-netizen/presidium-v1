/**
 * Content sanitization utilities
 * Uses DOMPurify for XSS protection
 */

import DOMPurify from 'dompurify';

// Configure DOMPurify for different use cases
const CONFIG = {
  // Strict mode for user-generated content
  strict: {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'code', 'pre'],
    ALLOWED_ATTR: [],
  },
  // Moderate mode for comments
  moderate: {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'a', 'code'],
    ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  },
  // Relaxed mode for rich text
  relaxed: {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  },
};

/**
 * Sanitize HTML content for messages
 */
export function sanitizeMessage(content: string): string {
  if (typeof window === 'undefined') {
    // Server-side: return as-is or implement server-side sanitization
    return content;
  }

  return DOMPurify.sanitize(content, CONFIG.strict);
}

/**
 * Sanitize HTML content for comments
 */
export function sanitizeComment(content: string): string {
  if (typeof window === 'undefined') {
    return content;
  }

  return DOMPurify.sanitize(content, CONFIG.moderate);
}

/**
 * Sanitize HTML content for rich text
 */
export function sanitizeRichText(content: string): string {
  if (typeof window === 'undefined') {
    return content;
  }

  return DOMPurify.sanitize(content, CONFIG.relaxed);
}

/**
 * Sanitize URL for links
 */
export function sanitizeUrl(url: string): string {
  if (typeof window === 'undefined') {
    return url;
  }

  // Only allow http, https, mailto protocols
  const validProtocols = ['http:', 'https:', 'mailto:'];
  try {
    const parsedUrl = new URL(url);
    if (!validProtocols.includes(parsedUrl.protocol)) {
      return '#';
    }
    return url;
  } catch {
    // Invalid URL
    return '#';
  }
}

/**
 * Escape HTML entities
 */
export function escapeHtml(content: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return content.replace(/[&<>"'/]/g, (char) => escapeMap[char]);
}

/**
 * Strip all HTML tags
 */
export function stripHtml(content: string): string {
  if (typeof window === 'undefined') {
    return content.replace(/<[^>]*>/g, '');
  }

  return DOMPurify.sanitize(content, { ALLOWED_TAGS: [] });
}
