/**
 * Vector Search Channel Tests
 * Single responsibility: Test vector similarity operations
 * Coverage target: 9.16% → 75%
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session } from 'neo4j-driver';
import { VectorSearchChannel } from '../../../../src/infrastructure/services/search/vector-search-channel';

// Mock dependencies
vi.mock('../../../../src/infrastructure/utilities', () => ({
  calculateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

describe('VectorSearchChannel - Semantic Search Engine', () => {
  let channel: VectorSearchChannel;
  let mockSession: Session;

  beforeEach(() => {
    mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as Session;

    channel = new VectorSearchChannel(mockSession);
  });

  describe('GDS Support Detection', () => {
    it('should detect GDS availability', async () => {
      // Mock GDS success
      (mockSession.run as any).mockResolvedValueOnce({ records: [] });

      const result = await channel.search('test', 10, 0.5);
      
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('gds.similarity.cosine'),
        expect.any(Object)
      );
    });

    it('should fallback to in-memory when GDS unavailable', async () => {
      // Mock GDS failure, then return memory data
      (mockSession.run as any)
        .mockRejectedValueOnce(new Error('GDS not available'))
        .mockResolvedValueOnce({
          records: [{
            get: vi.fn().mockImplementation((key) => {
              if (key === 'id') return 'test-id';
              if (key === 'nameEmbedding') return [0.2, 0.3, 0.4];
              return [];
            })
          }]
        });

      const results = await channel.search('test', 10, 0.5);
      
      expect(results).toBeDefined();
    });
  });

  describe('Memory Type Filtering', () => {
    it('should include memory type filter in GDS query', async () => {
      (mockSession.run as any).mockResolvedValue({ records: [] });

      await channel.search('test', 10, 0.5, ['project', 'task']);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.memoryType IN $memoryTypes'),
        expect.objectContaining({
          memoryTypes: ['project', 'task']
        })
      );
    });

    it('should include memory type filter in in-memory query', async () => {
      // Force in-memory path
      (mockSession.run as any)
        .mockRejectedValueOnce(new Error('GDS not available'))
        .mockResolvedValueOnce({ records: [] });

      await channel.search('test', 10, 0.5, ['project']);

      expect(mockSession.run).toHaveBeenLastCalledWith(
        expect.stringContaining('WHERE m.memoryType IN $memoryTypes'),
        expect.objectContaining({
          memoryTypes: ['project']
        })
      );
    });
  });

  describe('Cosine Similarity Calculation', () => {
    it('should calculate similarity between valid vectors', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1, 0];
      
      // Access private method for testing
      const similarity = (channel as any).cosineSimilarity(vector1, vector2);
      
      expect(similarity).toBe(0); // Orthogonal vectors
    });

    it('should handle identical vectors', () => {
      const vector1 = [1, 1, 1];
      const vector2 = [1, 1, 1];
      
      const similarity = (channel as any).cosineSimilarity(vector1, vector2);
      
      expect(similarity).toBe(1); // Identical vectors
    });

    it('should handle invalid vectors gracefully', () => {
      const similarity1 = (channel as any).cosineSimilarity([], [1, 2]);
      const similarity2 = (channel as any).cosineSimilarity(null, [1, 2]);
      const similarity3 = (channel as any).cosineSimilarity([NaN, NaN], [1, 2]);
      
      expect(similarity1).toBe(0);
      expect(similarity2).toBe(0);
      expect(similarity3).toBe(0); // All NaN values should result in 0 magnitude
    });
  });

  describe('Threshold Filtering', () => {
    it('should filter results by similarity threshold', async () => {
      // Force in-memory calculation with test data
      (mockSession.run as any)
        .mockRejectedValueOnce(new Error('GDS not available'))
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn().mockImplementation((key) => {
                if (key === 'id') return 'high-sim';
                if (key === 'nameEmbedding') return [0.1, 0.2, 0.3]; // Will have high similarity
                return [];
              })
            },
            {
              get: vi.fn().mockImplementation((key) => {
                if (key === 'id') return 'low-sim';
                if (key === 'nameEmbedding') return [1, 0, 0]; // Will have low similarity
                return [];
              })
            }
          ]
        });

      const results = await channel.search('test', 10, 0.8); // High threshold
      
      // Should filter out low similarity results
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Limit Enforcement', () => {
    it('should respect result limit in GDS query', async () => {
      (mockSession.run as any).mockResolvedValue({ records: [] });

      await channel.search('test', 5, 0.1);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          limit: expect.objectContaining({
            toNumber: expect.any(Function)
          })
        })
      );
    });
  });
});
