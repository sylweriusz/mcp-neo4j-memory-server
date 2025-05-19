import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Session } from 'neo4j-driver';
import { EnhancedUnifiedSearch, EnhancedSearchResult } from '../../src/search/enhanced-unified-search';

// Mock dependencies
vi.mock('../../src/vector/embeddings', () => ({
  calculateEmbedding: vi.fn()
}));

vi.mock('../../src/vector/support', () => ({
  checkVectorSupport: vi.fn()
}));

describe('EnhancedUnifiedSearch', () => {
  let mockSession: Session;
  let search: EnhancedUnifiedSearch;
  let mockRun: any;

  beforeEach(() => {
    mockRun = vi.fn();
    mockSession = {
      run: mockRun,
      close: vi.fn()
    } as any;

    search = new EnhancedUnifiedSearch(mockSession);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      expect(search).toBeInstanceOf(EnhancedUnifiedSearch);
    });

    it('should accept custom config', () => {
      const customConfig = {
        weights: { vector: 0.6, metadataExact: 0.3, metadataFulltext: 0.1, tags: 0.0 },
        threshold: 0.2
      };
      const customSearch = new EnhancedUnifiedSearch(mockSession, customConfig);
      expect(customSearch).toBeInstanceOf(EnhancedUnifiedSearch);
    });
  });

  describe('Fulltext Candidate Retrieval', () => {
    it('should fetch fulltext candidates successfully', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({
          records: [
            { get: vi.fn().mockImplementation((key) => key === 'id' ? 'mem1' : 0.8) },
            { get: vi.fn().mockImplementation((key) => key === 'id' ? 'mem2' : 0.6) }
          ]
        })
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn().mockImplementation((key) => {
                const record = {
                  id: 'mem1',
                  name: 'Test Memory',
                  type: 'project',
                  metadata: '{"status": "active"}',
                  embedding: [0.1, 0.2, 0.3],
                  observations: ['Test observation'],
                  tags: ['test'],
                  ancestors: [],
                  descendants: []
                };
                return record[key as keyof typeof record];
              }),
              has: vi.fn().mockReturnValue(true)
            }
          ]
        });

      const results = await search.search('test query', 10, true);

      expect(mockRun).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mem1');
    });

    it('should handle fulltext search failure gracefully', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      // First call fails (fulltext), second succeeds (main query)
      mockRun
        .mockRejectedValueOnce(new Error('Fulltext index not available'))
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn().mockImplementation((key) => {
                const record = {
                  id: 'mem1',
                  name: 'Test Memory',
                  type: 'project',
                  metadata: '{}',
                  embedding: [0.1, 0.2, 0.3],
                  observations: [],
                  tags: []
                };
                return record[key as keyof typeof record];
              }),
              has: vi.fn().mockReturnValue(false)
            }
          ]
        });

      const results = await search.search('test query');

      expect(results).toBeDefined();
      expect(mockRun).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Type Filtering', () => {
    it('should apply memory type filters', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({ records: [] }); // Main query

      await search.search('query', 10, true, ['project', 'person']);

      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('AND node.memoryType IN $memoryTypes'),
        expect.objectContaining({ memoryTypes: ['project', 'person'] })
      );
    });
  });

  describe('Graph Context Integration', () => {
    it('should include graph context when requested', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({ records: [] }); // Main query

      await search.search('query', 10, true);

      const mainQuery = mockRun.mock.calls[1][0];
      expect(mainQuery).toContain('OPTIONAL MATCH path1 = (ancestor:Memory)');
      expect(mainQuery).toContain('OPTIONAL MATCH path2 = (m)-[rel2:RELATES_TO*1..2]->(descendant:Memory)');
    });

    it('should exclude graph context when not requested', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({ records: [] }); // Main query

      await search.search('query', 10, false);

      const mainQuery = mockRun.mock.calls[1][0];
      expect(mainQuery).not.toContain('ancestors');
      expect(mainQuery).not.toContain('descendants');
    });
  });

  describe('Score Calculation', () => {
    it('should calculate vector similarity scores', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      const { checkVectorSupport } = await import('../../src/vector/support');
      
      (calculateEmbedding as any).mockResolvedValue([1.0, 0.0, 0.0]);
      (checkVectorSupport as any).mockResolvedValue('none');

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn().mockImplementation((key) => {
                const record = {
                  id: 'mem1',
                  name: 'Similar Memory',
                  type: 'project',
                  metadata: '{}',
                  embedding: [1.0, 0.0, 0.0], // Perfect match
                  observations: [],
                  tags: []
                };
                return record[key as keyof typeof record];
              }),
              has: vi.fn().mockReturnValue(false)
            }
          ]
        });

      const results = await search.search('test');

      expect(results[0].score).toBeGreaterThan(0.4); // Should get high vector score
    });

    it('should boost metadata exact matches', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn().mockImplementation((key) => {
                const record = {
                  id: 'mem1',
                  name: 'Test Memory',
                  type: 'project',
                  metadata: '{"status": "active", "technology": "react"}',
                  embedding: [0.0, 0.0, 0.0], // No vector similarity
                  observations: [],
                  tags: []
                };
                return record[key as keyof typeof record];
              }),
              has: vi.fn().mockReturnValue(false)
            }
          ]
        });

      const results = await search.search('react active');

      expect(results[0].score).toBeGreaterThan(0.1); // Should get metadata boost
    });

    it('should filter by threshold', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      // Create search with high threshold
      const highThresholdSearch = new EnhancedUnifiedSearch(mockSession, { threshold: 0.8 });

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn().mockImplementation((key) => {
                const record = {
                  id: 'mem1',
                  name: 'Low Score Memory',
                  type: 'project',
                  metadata: '{}',
                  embedding: [0.0, 0.0, 0.0], // Low similarity
                  observations: [],
                  tags: []
                };
                return record[key as keyof typeof record];
              }),
              has: vi.fn().mockReturnValue(false)
            }
          ]
        });

      const results = await highThresholdSearch.search('unrelated query');

      expect(results).toHaveLength(0); // Should be filtered out by threshold
    });
  });

  describe('Metadata Filtering', () => {
    it('should filter relevant metadata fields', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({
          records: [
            {
              get: vi.fn().mockImplementation((key) => {
                const record = {
                  id: 'mem1',
                  name: 'Test Memory',
                  type: 'project',
                  metadata: JSON.stringify({
                    status: 'active',
                    technology: 'react',
                    created_by: 'system',
                    internal_id: '12345',
                    description: 'A test project using react framework'
                  }),
                  embedding: [0.1, 0.2, 0.3],
                  observations: [],
                  tags: []
                };
                return record[key as keyof typeof record];
              }),
              has: vi.fn().mockReturnValue(false)
            }
          ]
        });

      const results = await search.search('react project');

      expect(results[0].metadata).toHaveProperty('technology');
      expect(results[0].metadata).toHaveProperty('status');
      // Should not include all 5 fields, only top 3 relevant ones
      expect(Object.keys(results[0].metadata)).toHaveLength(3);
    });
  });

  describe('Result Limiting', () => {
    it('should respect limit parameter', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      const mockRecords = Array.from({ length: 15 }, (_, i) => ({
        get: vi.fn().mockImplementation((key) => {
          const record = {
            id: `mem${i}`,
            name: `Memory ${i}`,
            type: 'project',
            metadata: '{}',
            embedding: [0.1, 0.2, 0.3],
            observations: [],
            tags: []
          };
          return record[key as keyof typeof record];
        }),
        has: vi.fn().mockReturnValue(false)
      }));

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({ records: mockRecords });

      const results = await search.search('test', 5);

      expect(results).toHaveLength(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext succeeds
        .mockRejectedValueOnce(new Error('Database connection lost')); // Main query fails

      await expect(search.search('test')).rejects.toThrow('Database connection lost');
    });

    it('should handle empty query strings', async () => {
      const { calculateEmbedding } = await import('../../src/vector/embeddings');
      (calculateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

      mockRun
        .mockResolvedValueOnce({ records: [] })  // Fulltext
        .mockResolvedValueOnce({ records: [] }); // Main query

      const results = await search.search('');

      expect(results).toBeDefined();
      expect(results).toHaveLength(0);
    });
  });
});
