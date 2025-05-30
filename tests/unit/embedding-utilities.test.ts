/**
 * Embedding Utility Tests
 * Single responsibility: Test vector embedding operations
 */
import { describe, it, expect } from 'vitest';
import { calculateSimilarity } from '../../src/infrastructure/utilities';

describe('Embedding Utilities', () => {
  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = [0.1, 0.2, 0.3];
      const similarity = calculateSimilarity(vec, vec);
      
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const similarity = calculateSimilarity(vec1, vec2);
      
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should handle invalid inputs gracefully', () => {
      expect(calculateSimilarity(null as any, [])).toBe(0);
      expect(calculateSimilarity([], null as any)).toBe(0);
      expect(calculateSimilarity([1], [1, 2])).toBe(0); // Different lengths
    });

    it('should calculate correct cosine similarity', () => {
      const vec1 = [3, 4, 0];
      const vec2 = [4, 3, 0];
      const similarity = calculateSimilarity(vec1, vec2);
      
      // Expected: (3*4 + 4*3 + 0*0) / (sqrt(9+16) * sqrt(16+9)) = 24/25 = 0.96
      expect(similarity).toBeCloseTo(0.96, 2);
    });

    it('should handle zero vectors', () => {
      const zeroVec = [0, 0, 0];
      const normalVec = [1, 2, 3];
      
      expect(calculateSimilarity(zeroVec, normalVec)).toBe(0);
      expect(calculateSimilarity(normalVec, zeroVec)).toBe(0);
    });
  });
});
