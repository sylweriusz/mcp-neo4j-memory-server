/**
 * Search Config Tests
 * Single responsibility: Verify search configuration defaults and structure
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
      expect(DEFAULT_SEARCH_CONFIG.weights.tags).toBeDefined();
    });

    it('should have weights that sum to 1.0', () => {
      const { vector, metadataExact, metadataFulltext, tags } = DEFAULT_SEARCH_CONFIG.weights;
      const sum = vector + metadataExact + metadataFulltext + tags;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have vector as the highest weight', () => {
      const { vector, metadataExact, metadataFulltext, tags } = DEFAULT_SEARCH_CONFIG.weights;
      expect(vector).toBeGreaterThan(metadataExact);
      expect(vector).toBeGreaterThan(metadataFulltext);
      expect(vector).toBeGreaterThan(tags);
    });

    it('should have metadataExact as the second highest weight', () => {
      const { metadataExact, metadataFulltext, tags } = DEFAULT_SEARCH_CONFIG.weights;
      expect(metadataExact).toBeGreaterThan(metadataFulltext);
      expect(metadataExact).toBeGreaterThan(tags);
    });

    it('should have metadataFulltext as the third highest weight', () => {
      const { metadataFulltext, tags } = DEFAULT_SEARCH_CONFIG.weights;
      expect(metadataFulltext).toBeGreaterThan(tags);
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
          vector: 0.4,
          metadataExact: 0.3,
          metadataFulltext: 0.2,
          tags: 0.1
        },
        threshold: 0.2,
        maxGraphDepth: 3,
        maxRelatedItems: 5
      };

      expect(customConfig.weights.vector).toBe(0.4);
      expect(customConfig.weights.metadataExact).toBe(0.3);
      expect(customConfig.weights.metadataFulltext).toBe(0.2);
      expect(customConfig.weights.tags).toBe(0.1);
      expect(customConfig.threshold).toBe(0.2);
      expect(customConfig.maxGraphDepth).toBe(3);
      expect(customConfig.maxRelatedItems).toBe(5);

      // Weights should still sum to 1.0
      const sum = customConfig.weights.vector + 
                  customConfig.weights.metadataExact + 
                  customConfig.weights.metadataFulltext + 
                  customConfig.weights.tags;
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });
});
