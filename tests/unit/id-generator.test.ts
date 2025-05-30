/**
 * ID Generator Tests
 * Single responsibility: Verify compact ID generation meets GDD specs
 */
import { describe, it, expect } from 'vitest';
import { generateCompactId, compressionStats } from '../../src/id_generator';

describe('ID Generator', () => {
  describe('generateCompactId', () => {
    it('should generate 18-character BASE85 identifiers', () => {
      const id = generateCompactId();
      expect(id).toHaveLength(18);
      expect(typeof id).toBe('string');
    });

    it('should generate unique identifiers', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        const id = generateCompactId();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });

    it('should generate time-sortable identifiers', async () => {
      const id1 = generateCompactId();
      // Longer delay to ensure different timestamps in ULID generation
      await new Promise(resolve => setTimeout(resolve, 10));
      const id2 = generateCompactId();
      
      // Later IDs should be lexicographically greater (time-sortable)
      expect(id2 > id1).toBe(true);
    });

    it('should only contain valid BASE85 characters', () => {
      const id = generateCompactId();
      const validChars = /^[0-9A-Za-z!#$%&()*+,\-./:;=?@_{}~<]+$/;
      expect(id).toMatch(validChars);
    });

    it('should not contain problematic serialization characters', () => {
      const id = generateCompactId();
      const problematicChars = /[\\<>[\]|^]/;
      expect(id).not.toMatch(problematicChars);
    });
  });

  describe('compressionStats', () => {
    it('should provide accurate compression statistics', () => {
      expect(compressionStats.standardUlidLength).toBe(26);
      expect(compressionStats.compactIdLength).toBe(18);
      expect(compressionStats.compressionRatio).toBeCloseTo(18/26, 2);
      expect(compressionStats.spaceSaved).toBeCloseTo((26-18)/26, 2);
    });
  });
});
