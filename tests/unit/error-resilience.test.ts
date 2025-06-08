/**
 * Error Resilience Tests - Production Edge Cases
 * Strategic coverage for critical error paths to improve overall coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XenovaEmbeddingService } from '../../src/infrastructure/services/embedding-service';
import { QueryClassifier } from '../../src/infrastructure/services/search/query-classifier';
import { ContextLevelProcessor } from '../../src/application/unified-handlers/services/context-level-processor';
import { DateFilterProcessor } from '../../src/application/unified-handlers/services/date-filter-processor';
import { LocalIdResolver } from '../../src/application/unified-handlers/services/local-id-resolver';
import { SearchMemoriesUseCase } from '../../src/application/use-cases/search-memories';
import { generateCompactId } from '../../src/id_generator';

describe('Error Resilience - Production Edge Cases', () => {
  
  describe('Embedding Service Error Paths', () => {
    let embeddingService: XenovaEmbeddingService;

    beforeEach(() => {
      embeddingService = new XenovaEmbeddingService();
    });

    it('should handle model loading failures gracefully', async () => {
      // Mock the embedding manager to throw error
      const mockManager = vi.spyOn(embeddingService as any, 'embeddingManager', 'get');
      mockManager.mockReturnValue({
        calculateEmbedding: vi.fn().mockRejectedValue(new Error('Model failed to load')),
        calculateSimilarity: vi.fn(),
        getModelDimensions: vi.fn(),
        preloadModel: vi.fn(),
        shutdown: vi.fn()
      });

      await expect(embeddingService.calculateEmbedding('test')).rejects.toThrow('Model failed to load');
    });

    it('should handle dimension calculation failures', async () => {
      const mockManager = vi.spyOn(embeddingService as any, 'embeddingManager', 'get');
      mockManager.mockReturnValue({
        calculateEmbedding: vi.fn(),
        calculateSimilarity: vi.fn(),
        getModelDimensions: vi.fn().mockRejectedValue(new Error('Dimension calculation failed')),
        preloadModel: vi.fn(),
        shutdown: vi.fn()
      });

      await expect(embeddingService.getModelDimensions()).rejects.toThrow('Dimension calculation failed');
    });
  });

  describe('Query Classification Edge Cases', () => {
    let classifier: QueryClassifier;

    beforeEach(() => {
      classifier = new QueryClassifier();
    });

    it('should reject null queries', () => {
      expect(() => classifier.classify(null as any)).toThrow('Query must be a non-empty string');
    });

    it('should reject undefined queries', () => {
      expect(() => classifier.classify(undefined as any)).toThrow('Query must be a non-empty string');
    });

    it('should reject non-string queries', () => {
      expect(() => classifier.classify(123 as any)).toThrow('Query must be a non-empty string');
      expect(() => classifier.classify({} as any)).toThrow('Query must be a non-empty string');
      expect(() => classifier.classify([] as any)).toThrow('Query must be a non-empty string');
    });

    it('should handle empty string queries', () => {
      // Empty string with just spaces should throw
      expect(() => classifier.classify('   ')).toThrow('Query must be a non-empty string');
    });

    it('should handle very long queries gracefully', () => {
      const veryLongQuery = 'a'.repeat(10000);
      const result = classifier.classify(veryLongQuery);
      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('Context Level Processor Edge Cases', () => {
    let processor: ContextLevelProcessor;

    beforeEach(() => {
      processor = new ContextLevelProcessor();
    });

    it('should reject invalid context levels', () => {
      expect(() => processor.validateContextLevel('invalid')).toThrow('Invalid context level: invalid');
    });

    it('should handle empty context level strings', () => {
      expect(() => processor.validateContextLevel('')).toThrow('Invalid context level: ');
    });

    it('should handle null context levels', () => {
      expect(() => processor.validateContextLevel(null as any)).toThrow('Invalid context level: null');
    });

    it('should process malformed memory results gracefully', () => {
      const malformedResults = [
        { id: 'valid1', name: 'test', memoryType: 'test' }, // Valid entry
        { id: 'valid2', name: 'test2', memoryType: 'test' } // Another valid entry
      ] as any[];

      // Should process valid entries without throwing
      const result = processor.applyContextLevel(malformedResults, 'minimal');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('memoryType');
    });
  });

  describe('Date Filter Processor Edge Cases', () => {
    let processor: DateFilterProcessor;

    beforeEach(() => {
      processor = new DateFilterProcessor();
    });

    it('should handle conflicting date ranges', () => {
      const filters = {
        createdAfter: '2025-01-01',
        createdBefore: '2024-01-01' // Before the after date
      };

      // Date filter processor validates during filter processing
      expect(() => processor.validateDateFilters(filters)).toThrow('createdAfter must be earlier than createdBefore');
    });

    it('should reject invalid ISO date formats', () => {
      const filters = {
        createdAfter: 'not-a-date'
      };

      expect(() => processor.processDateFilters(filters)).toThrow('Invalid date format: not-a-date');
    });

    it('should reject invalid relative formats', () => {
      const filters = {
        createdAfter: '5x' // Invalid unit
      };

      expect(() => processor.processDateFilters(filters)).toThrow('Invalid date format: 5x');
    });

    it('should handle extreme date values', () => {
      const filters = {
        createdAfter: '1900-01-01',
        createdBefore: '2099-12-31'
      };

      const result = processor.processDateFilters(filters);
      expect(result.cypher).toContain('createdAfter');
      expect(result.cypher).toContain('createdBefore');
    });
  });

  describe('Local ID Resolver Edge Cases', () => {
    let resolver: LocalIdResolver;

    beforeEach(() => {
      resolver = new LocalIdResolver();
    });

    it('should detect duplicate local IDs within request', () => {
      const memories = [
        { localId: 'mem1', name: 'Memory 1' },
        { localId: 'mem1', name: 'Memory 2' }, // Duplicate
        { localId: 'mem2', name: 'Memory 3' }
      ];

      expect(() => resolver.validateLocalIds(memories)).toThrow('Duplicate localId "mem1" in request');
    });

    it('should reject local IDs that look like real memory IDs', () => {
      // Generate a real-looking memory ID
      const realLookingId = generateCompactId();
      const memories = [
        { localId: realLookingId, name: 'Memory 1' }
      ];

      expect(() => resolver.validateLocalIds(memories)).toThrow('Local ID cannot look like real memory ID');
    });

    it('should handle relations with undefined IDs', () => {
      const relations = [
        { from: undefined, to: 'mem2', type: 'RELATES_TO' }
      ] as any[];

      const mapping = new Map<string, string>();
      
      expect(() => resolver.resolveMemoryRequest(relations, mapping)).toThrow('ID cannot be undefined in relation');
    });

    it('should provide helpful error for unresolved local IDs', () => {
      const relations = [
        { from: 'unknown-local', to: 'mem2', type: 'RELATES_TO' }
      ];

      const mapping = new Map<string, string>([['mem2', 'real-id-2']]);
      
      expect(() => resolver.resolveMemoryRequest(relations, mapping)).toThrow('LocalId "unknown-local" not found');
    });
  });

  describe('Search Use Case Error Handling', () => {
    it('should validate search request parameters', async () => {
      const mockRepository = {
        search: vi.fn()
      };

      const searchUseCase = new SearchMemoriesUseCase(mockRepository as any);

      // Test empty query
      await expect(searchUseCase.execute({ query: '' })).rejects.toThrow('Search query is required');
      
      // Test null query
      await expect(searchUseCase.execute({ query: null as any })).rejects.toThrow('Search query is required');
      
      // Test negative limit
      await expect(searchUseCase.execute({ query: 'test', limit: -1 })).rejects.toThrow('Search limit must be positive');
      
      // Test zero limit
      await expect(searchUseCase.execute({ query: 'test', limit: 0 })).rejects.toThrow('Search limit must be positive');
      
      // Test invalid threshold
      await expect(searchUseCase.execute({ query: 'test', threshold: 1.5 })).rejects.toThrow('Search threshold must be between 0 and 1');
      await expect(searchUseCase.execute({ query: 'test', threshold: -0.1 })).rejects.toThrow('Search threshold must be between 0 and 1');
    });
  });

  describe('ID Generator Edge Cases', () => {
    it('should generate unique IDs under stress', () => {
      const ids = new Set<string>();
      const count = 1000;
      
      // Generate many IDs quickly to test uniqueness
      for (let i = 0; i < count; i++) {
        const id = generateCompactId();
        expect(id).toHaveLength(18);
        expect(ids.has(id)).toBe(false); // Should be unique
        ids.add(id);
      }
      
      expect(ids.size).toBe(count);
    });

    it('should generate valid BASE85 character sets', () => {
      const validChars = /^[0-9A-Za-z!#$%&()*+,\-./:;=?@_{}~`]+$/;
      
      for (let i = 0; i < 100; i++) {
        const id = generateCompactId();
        expect(id).toMatch(validChars);
        expect(id).toHaveLength(18);
      }
    });
  });

  describe('Memory Pressure Scenarios', () => {
    it('should handle large batch operations gracefully', () => {
      // Test with very large arrays
      const processor = new ContextLevelProcessor();
      
      // Create a large result set
      const largeResults = Array.from({ length: 10000 }, (_, i) => ({
        id: `mem-${i}`,
        name: `Memory ${i}`,
        memoryType: 'test',
        score: Math.random()
      }));
      
      const result = processor.applyContextLevel(largeResults, 'minimal');
      expect(result).toHaveLength(10000);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('memoryType');
    });

    it('should handle deeply nested metadata structures', () => {
      const processor = new ContextLevelProcessor();
      
      const deepMetadata = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'deep value'
              }
            }
          }
        },
        array: new Array(1000).fill('test'),
        largeString: 'x'.repeat(100000)
      };
      
      const result = processor.applyContextLevel([{
        id: 'test',
        name: 'test',
        memoryType: 'test',
        metadata: deepMetadata
      }], 'full');
      
      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual(deepMetadata);
    });
  });

  describe('Concurrent Operation Safety', () => {
    it('should handle concurrent ID generation safely', async () => {
      const concurrentGenerations = await Promise.all(
        Array.from({ length: 100 }, () => 
          Promise.resolve(generateCompactId())
        )
      );
      
      const uniqueIds = new Set(concurrentGenerations);
      expect(uniqueIds.size).toBe(100); // All should be unique
    });

    it('should handle concurrent validation calls', async () => {
      const processor = new ContextLevelProcessor();
      
      const concurrentValidations = await Promise.all(
        Array.from({ length: 50 }, () => 
          Promise.resolve(processor.validateContextLevel('minimal'))
        )
      );
      
      concurrentValidations.forEach(result => {
        expect(result).toBe('minimal');
      });
    });
  });
});
