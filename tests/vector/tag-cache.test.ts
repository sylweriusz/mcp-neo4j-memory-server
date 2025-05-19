/**
 * Tag Embedding Cache Test
 * Verifies the database-level caching implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Session } from 'neo4j-driver';
import { extractTags, clearInvalidTagEmbeddings, getTagEmbeddingStats } from '../../src/vector/tags.js';

// Mock neo4j-driver module
vi.mock('neo4j-driver', () => {
  return {
    default: {
      auth: {
        basic: vi.fn(),
      },
      driver: vi.fn(),
    },
  };
});

// Mock embeddings module
vi.mock('../../src/vector/embeddings.js', () => ({
  calculateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4]), // Mock 4-dim embedding
  calculateSimilarity: vi.fn().mockReturnValue(0.5), // Mock similarity
}));

describe('Tag Embedding Cache', () => {
  let mockSession: any;
  
  beforeEach(() => {
    mockSession = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue({}),
      beginTransaction: vi.fn(),
    };
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should extract tags without session (fallback mode)', async () => {
    const text = "machine learning artificial intelligence";
    
    // Should work without session
    const tags = await extractTags(text);
    expect(Array.isArray(tags)).toBe(true);
  });

  it('should cache tag embeddings in database', async () => {
    const text = "machine learning test";
    
    // Mock empty cache first
    mockSession.run.mockImplementationOnce(() => ({
      records: [] // No cached embeddings
    }));
    
    // Mock successful storage
    const mockTx = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      commit: vi.fn().mockResolvedValue({}),
      rollback: vi.fn().mockResolvedValue({}),
    };
    mockSession.beginTransaction.mockReturnValue(mockTx);
    
    const tags = await extractTags(text, mockSession);
    
    // Should have called database to check for cached embeddings
    expect(mockSession.run).toHaveBeenCalledWith(
      expect.stringContaining('MATCH (t:Tag)'),
      expect.objectContaining({
        tagNames: expect.any(Array),
        version: expect.any(String)
      })
    );
    
    expect(Array.isArray(tags)).toBe(true);
  });

  it('should use cached embeddings when available', async () => {
    const text = "machine learning";
    
    // Mock cached embeddings available
    mockSession.run.mockImplementationOnce(() => ({
      records: [
        {
          get: (field: string) => {
            if (field === 'name') return 'machine';
            if (field === 'embedding') return [0.1, 0.2, 0.3, 0.4];
            return null;
          }
        },
        {
          get: (field: string) => {
            if (field === 'name') return 'learning';
            if (field === 'embedding') return [0.2, 0.3, 0.4, 0.5];
            return null;
          }
        }
      ]
    }));
    
    const tags = await extractTags(text, mockSession);
    
    // Should have retrieved cached embeddings
    expect(mockSession.run).toHaveBeenCalledWith(
      expect.stringContaining('MATCH (t:Tag)'),
      expect.anything()
    );
    
    expect(Array.isArray(tags)).toBe(true);
  });

  it('should handle cache statistics', async () => {
    // Mock statistics query
    mockSession.run.mockImplementationOnce(() => ({
      records: [
        {
          get: (field: string) => {
            if (field === 'totalTags') return { toNumber: () => 10 };
            if (field === 'cachedEmbeddings') return { toNumber: () => 8 };
            return null;
          }
        }
      ]
    }));
    
    const stats = await getTagEmbeddingStats(mockSession);
    
    expect(stats.totalTags).toBe(10);
    expect(stats.cachedEmbeddings).toBe(8);
    expect(stats.cacheHitRate).toBe(80);
  });

  it('should clear invalid embeddings', async () => {
    // Mock clear operation
    mockSession.run.mockImplementationOnce(() => ({
      records: [
        {
          get: (field: string) => {
            if (field === 'cleared') return { toNumber: () => 5 };
            return null;
          }
        }
      ]
    }));
    
    const cleared = await clearInvalidTagEmbeddings(mockSession, 'old-version');
    
    expect(cleared).toBe(5);
    expect(mockSession.run).toHaveBeenCalledWith(
      expect.stringContaining('SET t.embedding = null'),
      expect.objectContaining({ version: 'old-version' })
    );
  });

  it('should handle errors gracefully', async () => {
    const text = "error test";
    
    // Mock database error
    mockSession.run.mockRejectedValueOnce(new Error('Database error'));
    
    // Should not throw, should return empty array
    const tags = await extractTags(text, mockSession);
    expect(Array.isArray(tags)).toBe(true);
  });
});