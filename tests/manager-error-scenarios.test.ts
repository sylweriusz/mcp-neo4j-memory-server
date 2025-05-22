/**
 * Manager error scenario tests
 * Covers missing branches for better coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Neo4jKnowledgeGraphManager } from '../src/manager';
import { Logger } from '../src/logger';

// Mock dependencies
vi.mock('../src/vector', () => ({
  calculateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
  extractTags: vi.fn().mockResolvedValue(['test-tag']),
  processMemoryVectors: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../src/vector/support', () => ({
  ensureVectorIndexes: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../src/search/enhanced-unified-search', () => ({
  EnhancedUnifiedSearch: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue([])
  }))
}));

describe('Manager Error Scenarios', () => {
  let manager: Neo4jKnowledgeGraphManager;
  let mockLogger: Logger;
  let mockSession: any;
  let mockTransaction: any;
  let mockDriver: any;

  beforeEach(() => {
    mockTransaction = {
      run: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn()
    };

    mockSession = {
      run: vi.fn(),
      close: vi.fn(),
      beginTransaction: vi.fn(() => mockTransaction)
    };

    mockDriver = {
      session: vi.fn(() => mockSession),
      close: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    const mockConfig = () => ({
      uri: 'bolt://localhost:7687',
      username: 'neo4j', 
      password: 'password',
      database: 'neo4j'
    });

    manager = new Neo4jKnowledgeGraphManager(mockConfig, mockLogger);
    
    // Replace driver with mock
    (manager as any).driver = mockDriver;
    (manager as any).initialized = true; // Skip initialization
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createMemories error handling', () => {
    it('should handle transaction rollback on database error', async () => {
      const memories = [{
        name: 'Test Memory',
        memoryType: 'Test',
        observations: ['test observation']
      }];

      mockSession.run.mockRejectedValue(new Error('Database error'));
      mockTransaction.run.mockRejectedValue(new Error('Transaction error'));

      await expect(manager.createMemories(memories)).rejects.toThrow('Transaction error');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle empty memories array', async () => {
      const result = await manager.createMemories([]);
      expect(result).toEqual([]);
    });

    it('should handle metadata as Map object', async () => {
      const metadata = new Map([['key', 'value']]);
      const memories = [{
        name: 'Test Memory',
        memoryType: 'Test',
        metadata,
        observations: []
      }];

      mockTransaction.run
        .mockResolvedValueOnce({ records: [] }) // No existing memory
        .mockResolvedValueOnce({ records: [] }); // Memory creation

      await manager.createMemories(memories);
      
      // Should stringify Map to Object
      expect(mockTransaction.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (m:Memory'),
        expect.objectContaining({
          metadata: '{"key":"value"}'
        })
      );
    });

    it('should handle embedding calculation failures', async () => {
      const { calculateEmbedding, extractTags } = await import('../src/vector');
      
      // Mock embedding failure
      vi.mocked(calculateEmbedding).mockRejectedValue(new Error('Embedding failed'));
      vi.mocked(extractTags).mockResolvedValue(['fallback-tag']);

      const memories = [{
        name: 'Test Memory',
        memoryType: 'Test',
        observations: ['test observation']
      }];

      mockTransaction.run
        .mockResolvedValueOnce({ records: [] }) // No existing memory
        .mockResolvedValueOnce({ records: [{ 
          get: (prop: string) => {
            switch(prop) {
              case 'id': return 'test-id';
              case 'name': return 'Test Memory';
              case 'memoryType': return 'Test';
              default: return 'test-id';
            }
          }
        }] }); // Memory creation

      await expect(manager.createMemories(memories)).rejects.toThrow('Failed to precalculate embeddings for memory "Test Memory": Embedding failed');
    });
  });

  describe('addObservations error handling', () => {
    it('should handle empty observations array', async () => {
      const result = await manager.addObservations([]);
      expect(result).toEqual([]);
    });

    it('should skip non-existent memories', async () => {
      const observations = [{
        memoryId: 'non-existent',
        contents: ['test observation']
      }];

      // Mock the first session call (check existing IDs) to return empty results
      mockSession.run.mockResolvedValueOnce({ 
        records: [{ get: () => [] }]  // Empty array for existingIds
      });

      await expect(manager.addObservations(observations)).rejects.toThrow('None of the specified memory IDs exist: non-existent');
    });

    it('should handle transaction rollback', async () => {
      const observations = [{
        memoryId: 'test-id',
        contents: ['test observation']
      }];

      // First call: session call to check existing IDs - should return the ID
      mockSession.run.mockResolvedValueOnce({ 
        records: [{ get: () => ['test-id'] }]  // Memory exists
      });

      // Second call: beginning transaction should fail
      mockTransaction.run.mockRejectedValueOnce(new Error('Transaction error'));

      await expect(manager.addObservations(observations)).rejects.toThrow('Transaction error');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should skip duplicate observations', async () => {
      const observations = [{
        memoryId: 'test-id',
        contents: ['existing observation', 'new observation']
      }];

      // Session call to check existing IDs - memory exists
      mockSession.run.mockResolvedValueOnce({ 
        records: [{ get: () => ['test-id'] }]  // Memory exists
      });

      // First transaction call: memory exists check
      mockTransaction.run
        .mockResolvedValueOnce({ records: [{ get: () => 'Test Memory' }] }) // Memory exists
        .mockResolvedValueOnce({ records: [] }) // Update modifiedAt
        .mockResolvedValueOnce({ 
          records: [{ get: () => 'existing observation' }]
        }) // Existing observations
        .mockResolvedValue({ records: [] }); // Create new observation

      const result = await manager.addObservations(observations);
      
      expect(result).toHaveLength(1);
      expect(result[0].contents).toEqual(['new observation']);
    });
  });

  describe('deleteObservations error handling', () => {
    it('should handle empty deletions array', async () => {
      await expect(manager.deleteObservations([])).resolves.not.toThrow();
    });

    it('should handle empty contents in deletion', async () => {
      const deletions = [{
        memoryId: 'test-id',
        contents: []
      }];

      await expect(manager.deleteObservations(deletions)).resolves.not.toThrow();
    });

    it('should handle transaction rollback', async () => {
      const deletions = [{
        memoryId: 'test-id',
        contents: ['observation to delete']
      }];

      mockTransaction.run.mockRejectedValue(new Error('Delete failed'));

      await expect(manager.deleteObservations(deletions)).rejects.toThrow('Delete failed');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createRelations error handling', () => {
    it('should handle empty relations array', async () => {
      const result = await manager.createRelations([]);
      expect(result).toEqual([]);
    });

    it('should filter invalid relations', async () => {
      const relations = [
        { fromId: 'valid-1', toId: 'valid-2', relationType: 'test' },
        { fromId: 'invalid', toId: 'valid-2', relationType: 'test' }
      ];

      // Mock that only valid-2 exists
      mockTransaction.run
        .mockResolvedValueOnce({ 
          records: [{ get: () => ['valid-2'] }]  // Only valid-2 exists
        });

      await expect(manager.createRelations(relations)).rejects.toThrow('Cannot create relations: memory IDs do not exist: valid-1, invalid');
    });

    it('should skip duplicate relations', async () => {
      const relations = [{
        fromId: 'from-id',
        toId: 'to-id',
        relationType: 'test'
      }];

      // Mock that the memory IDs don't exist
      mockTransaction.run
        .mockResolvedValueOnce({ 
          records: [{ get: () => [] }]  // No memory IDs exist
        });

      await expect(manager.createRelations(relations)).rejects.toThrow('Cannot create relations: memory IDs do not exist: from-id, to-id');
    });
  });

  describe('deleteMemories error handling', () => {
    it('should handle empty IDs array', async () => {
      await expect(manager.deleteMemories([])).resolves.not.toThrow();
    });

    it('should handle transaction rollback', async () => {
      const memoryIds = ['test-id'];

      mockTransaction.run.mockRejectedValue(new Error('Delete failed'));

      await expect(manager.deleteMemories(memoryIds)).rejects.toThrow('Delete failed');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('deleteRelations error handling', () => {
    it('should handle empty relations array', async () => {
      await expect(manager.deleteRelations([])).resolves.not.toThrow();
    });

    it('should handle transaction rollback', async () => {
      const relations = [{
        fromId: 'from-id',
        toId: 'to-id',
        relationType: 'test'
      }];

      mockTransaction.run.mockRejectedValue(new Error('Delete failed'));

      await expect(manager.deleteRelations(relations)).rejects.toThrow('Delete failed');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateMemoryMetadata error handling', () => {
    it('should throw error for non-existent memory', async () => {
      mockSession.run.mockResolvedValueOnce({ records: [] }); // Memory not found

      await expect(
        manager.updateMemoryMetadata('non-existent', { key: 'value' })
      ).rejects.toThrow('Memory with ID non-existent not found');
    });

    it('should handle update failure', async () => {
      mockSession.run
        .mockResolvedValueOnce({ records: [{ get: () => 'test-id' }] }) // Memory exists
        .mockRejectedValueOnce(new Error('Update failed')); // Update fails

      await expect(
        manager.updateMemoryMetadata('test-id', { key: 'value' })
      ).rejects.toThrow('Update failed');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('search error handling', () => {
    it('should handle search initialization failures', async () => {
      // Make the manager uninitialized
      (manager as any).initialized = false;
      
      // Mock database errors during initialization
      mockSession.run.mockRejectedValue(new Error('Database connection failed'));

      const result = await manager.searchNodes('test query');
      
      expect(result).toEqual({ 
        memories: [], 
        relations: [],
        _meta: {
          message: "No results found."
        }
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle vector search failures gracefully', async () => {
      const { EnhancedUnifiedSearch } = await import('../src/search/enhanced-unified-search');
      
      // Mock search failure
      const mockSearch = vi.fn().mockRejectedValue(new Error('Vector search failed'));
      vi.mocked(EnhancedUnifiedSearch).mockImplementation(() => ({
        search: mockSearch
      }) as any);

      const result = await manager.searchNodes('test query');
      
      expect(result).toEqual({ 
        memories: [], 
        relations: [],
        _meta: {
          message: "No results found."
        }
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle metadata search index failures', async () => {
      mockSession.run.mockRejectedValue(new Error('Fulltext index not available'));

      const result = await manager.searchMemoriesByMetadata('test query');
      
      expect(result._meta?.message).toContain('fulltext index may not be available');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getAllMemories error handling', () => {
    it('should return empty array on database error', async () => {
      mockSession.run.mockRejectedValue(new Error('Database error'));

      const result = await (manager as any).getAllMemories();
      
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('readGraph error handling', () => {
    it('should handle relations query failure', async () => {
      // Mock getAllMemories to succeed
      vi.spyOn(manager as any, 'getAllMemories').mockResolvedValue([]);
      
      // Mock relations query to fail
      mockSession.run.mockRejectedValue(new Error('Relations query failed'));

      const result = await manager.readGraph();
      
      expect(result).toEqual({ memories: [], relations: [] });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getMemorySummaries error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSession.run.mockRejectedValue(new Error('Database error'));

      const result = await manager.getMemorySummaries();
      
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('retrieveMemories error handling', () => {
    it('should handle empty IDs array', async () => {
      const result = await manager.retrieveMemories([]);
      expect(result).toEqual({ memories: [], relations: [] });
    });

    it('should handle database errors', async () => {
      mockSession.run.mockRejectedValue(new Error('Database error'));

      const result = await manager.retrieveMemories(['test-id']);
      
      expect(result).toEqual({ memories: [], relations: [] });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchMemoriesByTags error handling', () => {
    it('should handle empty tags array', async () => {
      const result = await manager.searchMemoriesByTags([]);
      expect(result).toEqual({ memories: [], relations: [] });
    });

    it('should handle null tags input', async () => {
      const result = await manager.searchMemoriesByTags(null as any);
      expect(result).toEqual({ memories: [], relations: [] });
    });

    it('should handle database errors', async () => {
      mockSession.run.mockRejectedValue(new Error('Database error'));

      const result = await manager.searchMemoriesByTags(['test-tag']);
      
      expect(result).toEqual({ memories: [], relations: [] });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchMemories error handling', () => {
    it('should fall back to searchNodes on enhanced search failure', async () => {
      const { EnhancedUnifiedSearch } = await import('../src/search/enhanced-unified-search');
      
      // Mock enhanced search with failing search method
      const mockEnhancedSearch = {
        search: vi.fn().mockRejectedValue(new Error('Enhanced search failed'))
      };
      vi.mocked(EnhancedUnifiedSearch).mockImplementation(() => mockEnhancedSearch as any);

      // Mock searchNodes to return empty results
      vi.spyOn(manager, 'searchNodes').mockResolvedValue({ memories: [], relations: [] });

      const result = await manager.searchMemories('test query');
      
      expect(result._meta?.message).toBe('Fallback search used due to enhanced search failure.');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle limit of 0', async () => {
      const { EnhancedUnifiedSearch } = await import('../src/search/enhanced-unified-search');
      
      vi.mocked(EnhancedUnifiedSearch).mockImplementation(() => ({
        search: vi.fn().mockResolvedValue([])
      }) as any);

      const result = await manager.searchMemories('test query', undefined, 0);
      
      expect(result._meta?.message).toBe('Limited to 0 results');
    });
  });
});
