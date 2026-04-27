/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */

import { describe, it, expect } from 'vitest';
import { runRegexCheck, quickRegexCheck, getRulesByCategory } from '../rules.js';

describe('Silent Claw — Regex Layer', () => {
  describe('runRegexCheck', () => {
    it('should detect drug-related messages', () => {
      const result = runRegexCheck('купить мефедрон заклад', 'message');
      expect(result.matched).toBe(true);
      expect(result.rule?.category).toBe('drugs');
      expect(result.rule?.severity).toBe('critical');
    });

    it('should detect fraud patterns', () => {
      const result = runRegexCheck('выигрыш 100000 руб', 'message');
      expect(result.matched).toBe(true);
      expect(result.rule?.category).toBe('fraud');
    });

    it('should detect violence', () => {
      const result = runRegexCheck('убить всех', 'message');
      expect(result.matched).toBe(true);
      expect(result.rule?.category).toBe('violence');
    });

    it('should pass clean messages', () => {
      const result = runRegexCheck('привет, как дела?', 'message');
      expect(result.matched).toBe(false);
    });

    it('should detect obfuscated text', () => {
      const result = runRegexCheck('к у п и т ь м е ф', 'message');
      expect(result.matched).toBe(true);
    });

    it('should respect context (NSFW not in messages)', () => {
      const result = runRegexCheck('порно видео', 'message');
      // NSFW rules only apply to post/comment, not message
      expect(result.matched).toBe(false);
    });

    it('should detect NSFW in posts', () => {
      const result = runRegexCheck('порно контент', 'post');
      expect(result.matched).toBe(true);
      expect(result.rule?.category).toBe('nsfw');
    });
  });

  describe('quickRegexCheck', () => {
    it('should return true for critical patterns only', () => {
      expect(quickRegexCheck('купить мефедрон')).toBe(true);
      expect(quickRegexCheck('убить')).toBe(true);
      expect(quickRegexCheck('подпишись')).toBe(false); // medium severity
      expect(quickRegexCheck('привет')).toBe(false);
    });
  });

  describe('getRulesByCategory', () => {
    it('should return rules for specific category', () => {
      const drugRules = getRulesByCategory('drugs');
      expect(drugRules.length).toBeGreaterThanOrEqual(2);
      drugRules.forEach(rule => {
        expect(rule.category).toBe('drugs');
      });
    });
  });
});
