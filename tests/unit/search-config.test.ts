/**
 * Search Config Tests
 * Single responsibility: Verify search configuration defaults and structure
 * CURRENT REALITY: No tag system - only vector, metadataExact, metadataFulltext weights
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SEARCH_CONFIG, SearchConfig } from '../../src/domain/entities/search-config';

describe('Search Config', () => {
  describe('DEFAULT_SEARCH_CONFIG', () => {
    it('should have properly structured weights', () => {
      expect(DEFAULT_SEARCH_CONFIG.weights).toBeDefined();
      expect(DEFAULT_SEARCH_CONFIG.weights.vector).toBeDefined();
      expect(DEFAULT_SEARCH_CONFIG.weights.metadataExact).toBeDefined();
      expect(DEFAULT_SEARCH_CONFIG.weights.metadataFulltext).toBeDefined();
    });

    it('should have weights that sum to 1.0', () => {
      const { vector, metadataExact, metadataFulltext } = DEFAULT_SEARCH_CONFIG.weights;
      const sum = vector + metadataExact + metadataFulltext;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have vector as the highest weight', () => {
      const { vector, metadataExact, metadataFulltext } = DEFAULT_SEARCH_CONFIG.weights;
      expect(vector).toBeGreaterThan(metadataExact);
      expect(vector).toBeGreaterThan(metadataFulltext);
    });

    it('should have metadataExact as the second highest weight', () => {
      const { metadataExact, metadataFulltext } = DEFAULT_SEARCH_CONFIG.weights;
      expect(metadataExact).toBeGreaterThan(metadataFulltext);
    });

    it('should have a threshold between 0 and 1', () => {
      expect(DEFAULT_SEARCH_CONFIG.threshold).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_SEARCH_CONFIG.threshold).toBeLessThanOrEqual(1);
    });

    it('should have a reasonable maxGraphDepth', () => {
      expect(DEFAULT_SEARCH_CONFIG.maxGraphDepth).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_SEARCH_CONFIG.maxGraphDepth).toBeLessThanOrEqual(5);
    });

    it('should have a reasonable maxRelatedItems', () => {
      expect(DEFAULT_SEARCH_CONFIG.maxRelatedItems).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_SEARCH_CONFIG.maxRelatedItems).toBeLessThanOrEqual(10);
    });
  });

  describe('Custom SearchConfig', () => {
    it('should allow custom configuration', () => {
      const customConfig: SearchConfig = {
        weights: {
          vector: 0.5,
          metadataExact: 0.3,
          metadataFulltext: 0.2
        },
        threshold: 0.2,
        maxGraphDepth: 3,
        maxRelatedItems: 5
      };

      expect(customConfig.weights.vector).toBe(0.5);
      expect(customConfig.weights.metadataExact).toBe(0.3);
      expect(customConfig.weights.metadataFulltext).toBe(0.2);
      expect(customConfig.threshold).toBe(0.2);
      expect(customConfig.maxGraphDepth).toBe(3);
      expect(customConfig.maxRelatedItems).toBe(5);

      // Weights should still sum to 1.0
      const sum = customConfig.weights.vector + 
                  customConfig.weights.metadataExact + 
                  customConfig.weights.metadataFulltext;
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });
});
