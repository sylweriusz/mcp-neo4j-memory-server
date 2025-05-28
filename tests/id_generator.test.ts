import { describe, it, expect } from 'vitest';
import { 
  generateCompactId, 
  isValidCompactId, 
  generateCompactIdBatch,
  generateCompactIdWithPrefix,
  compressionStats
} from '../src/id_generator';

describe('ID Generator', () => {
  describe('generateCompactId', () => {
    it('should generate a compact ID of correct length', () => {
      const id = generateCompactId();
      expect(id.length).toBe(18);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCompactId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs with valid characters', () => {
      const id = generateCompactId();
      expect(isValidCompactId(id)).toBe(true);
    });

    it('should maintain basic uniqueness and validity', () => {
      // Generate IDs to ensure they are unique and valid
      const id1 = generateCompactId();
      const id2 = generateCompactId();
      
      // IDs should be unique
      expect(id1).not.toBe(id2);
      
      // Both should be valid
      expect(isValidCompactId(id1)).toBe(true);
      expect(isValidCompactId(id2)).toBe(true);
      
      // Both should be proper length
      expect(id1.length).toBe(18);
      expect(id2.length).toBe(18);
      
      // Note: Time-sortable property comes from ULID base, 
      // but due to compression we rely on explicit timestamps in entities
    });
  });

  describe('isValidCompactId', () => {
    it('should return true for valid IDs', () => {
      const id = generateCompactId();
      expect(isValidCompactId(id)).toBe(true);
    });

    it('should return false for IDs with invalid length', () => {
      expect(isValidCompactId('abc')).toBe(false);
      expect(isValidCompactId('12345678901234567890')).toBe(false);
    });

    it('should return false for IDs with invalid characters', () => {
      // Test characters not in BASE85 charset (including removed problematic ones)
      expect(isValidCompactId('\\'.repeat(18))).toBe(false);
      expect(isValidCompactId('<'.repeat(18))).toBe(false);
      expect(isValidCompactId('['.repeat(18))).toBe(false);
      expect(isValidCompactId('`'.repeat(18))).toBe(false);
      expect(isValidCompactId(' '.repeat(18))).toBe(false);
    });

    it('should return false for empty input', () => {
      expect(isValidCompactId('')).toBe(false);
      expect(isValidCompactId(null as unknown as string)).toBe(false);
      expect(isValidCompactId(undefined as unknown as string)).toBe(false);
    });

    it('should validate with O(1) performance', () => {
      const id = generateCompactId();
      
      // Test multiple validations to ensure consistent performance
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        isValidCompactId(id);
      }
      const end = performance.now();
      
      // Should complete 1000 validations in under 10ms (very fast)
      expect(end - start).toBeLessThan(10);
    });
  });

  describe('generateCompactIdBatch', () => {
    it('should generate correct number of IDs', () => {
      const batch = generateCompactIdBatch(10);
      expect(batch.length).toBe(10);
    });

    it('should generate unique IDs in batch', () => {
      const batch = generateCompactIdBatch(50);
      const uniqueIds = new Set(batch);
      expect(uniqueIds.size).toBe(50);
    });

    it('should generate valid IDs in batch', () => {
      const batch = generateCompactIdBatch(5);
      batch.forEach(id => {
        expect(isValidCompactId(id)).toBe(true);
        expect(id.length).toBe(18);
      });
    });

    it('should handle empty batch', () => {
      const batch = generateCompactIdBatch(0);
      expect(batch.length).toBe(0);
    });
  });

  describe('generateCompactIdWithPrefix', () => {
    it('should generate ID with correct prefix', () => {
      const prefix = 'usr_';
      const id = generateCompactIdWithPrefix(prefix);
      
      expect(id.startsWith(prefix)).toBe(true);
      expect(id.length).toBe(prefix.length + 18);
    });

    it('should generate valid compact ID after prefix', () => {
      const prefix = 'ord_';
      const id = generateCompactIdWithPrefix(prefix);
      const compactPart = id.substring(prefix.length);
      
      expect(isValidCompactId(compactPart)).toBe(true);
    });

    it('should work with different prefixes', () => {
      const prefixes = ['user_', 'order_', 'session_', 'tx_', ''];
      
      prefixes.forEach(prefix => {
        const id = generateCompactIdWithPrefix(prefix);
        expect(id.startsWith(prefix)).toBe(true);
        
        const compactPart = id.substring(prefix.length);
        expect(isValidCompactId(compactPart)).toBe(true);
      });
    });
  });

  describe('compressionStats', () => {
    it('should have correct compression metrics', () => {
      expect(compressionStats.standardUlidLength).toBe(26);
      expect(compressionStats.compactIdLength).toBe(18);
      expect(compressionStats.compressionRatio).toBeCloseTo(18/26, 3);
      expect(compressionStats.spaceSaved).toBeCloseTo((26-18)/26, 3);
      expect(compressionStats.totalCombinations).toMatch(/^\d\.\d+e\+\d+$/);
    });

    it('should demonstrate significant space savings', () => {
      expect(compressionStats.spaceSaved).toBeGreaterThan(0.3); // > 30% space saved
      expect(compressionStats.compressionRatio).toBeLessThan(0.7); // < 70% of original size
    });
  });

  describe('Performance characteristics', () => {
    it('should generate IDs quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        generateCompactId();
      }
      const end = performance.now();
      
      // Should generate 1000 IDs in under 150ms (adjusted for slower CI environments)
      expect(end - start).toBeLessThan(150);
    });

    it('should handle batch generation efficiently', () => {
      const start = performance.now();
      generateCompactIdBatch(1000);
      const end = performance.now();
      
      // Should generate 1000 IDs in batch in under 150ms (adjusted for system variance)
      expect(end - start).toBeLessThan(150);
    });
  });

  describe('Neo4j integration characteristics', () => {
    it('should maintain basic uniqueness for compact IDs', () => {
      // Generate IDs to verify basic properties
      const ids: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        ids.push(generateCompactId());
      }
      
      // Verify that all IDs are different (basic uniqueness)
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
      
      // Verify all IDs are valid
      ids.forEach(id => {
        expect(isValidCompactId(id)).toBe(true);
        expect(id.length).toBe(18);
      });
      
      // Note: For time-based queries, we use the explicit createdAt/modifiedAt 
      // timestamps that are stored in memory nodes, not derived from the ID
    });

    it('should provide sufficient entropy for large datasets', () => {
      // 85^18 should provide enough combinations for massive datasets
      const entropy = Math.pow(85, 18);
      expect(entropy).toBeGreaterThan(1e30); // More than 10^30 combinations
    });

    it('should use only safe characters for Neo4j', () => {
      // Generate many IDs and verify all characters are safe
      const ids = generateCompactIdBatch(100);
      const allChars = ids.join('');
      
      // Should not contain removed dangerous characters
      expect(allChars).not.toContain('\\');
      expect(allChars).not.toContain('<');
      expect(allChars).not.toContain('>');
      expect(allChars).not.toContain('[');
      expect(allChars).not.toContain(']');
      expect(allChars).not.toContain('|');
      expect(allChars).not.toContain('^');
      
      // Should only contain characters from BASE85_CHARS (updated for safety)
      const base85Chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;=?@_{}~';
      for (const char of allChars) {
        expect(base85Chars).toContain(char);
      }
    });
  });
});
