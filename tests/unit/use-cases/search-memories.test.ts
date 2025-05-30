/**
 * Search Memories Use Case Tests
 * Single responsibility: Test search orchestration business logic
 * THE IMPLEMENTOR'S RULE: Test the conductor, not the orchestra
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchMemoriesUseCase } from '../../../src/application/use-cases/search-memories';
import { SearchRequest, SearchResult } from '../../../src/domain/repositories/search-repository';

describe('SearchMemoriesUseCase', () => {
  let searchUseCase: SearchMemoriesUseCase;
  let mockSearchRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSearchRepository = {
      search: vi.fn()
    };

    searchUseCase = new SearchMemoriesUseCase(mockSearchRepository);
  });

  describe('Valid Search Requests', () => {
    it('should execute basic search with minimal parameters', async () => {
      const request: SearchRequest = {
        query: 'test query'
      };

      const mockResults: SearchResult[] = [{
        memory: {
          id: 'Bm>test12345678901',
          name: 'Test Memory',
          memoryType: 'test',
          observations: [],
          tags: [],
          metadata: {}
        },
        score: 0.8,
        matchType: 'vector'
      }];

      mockSearchRepository.search.mockResolvedValue(mockResults);
      const results = await searchUseCase.execute(request);

      expect(mockSearchRepository.search).toHaveBeenCalledWith(request);
      expect(results).toEqual(mockResults);
    });

    it('should handle wildcard queries', async () => {
      const request: SearchRequest = { query: '*', limit: 10 };
      mockSearchRepository.search.mockResolvedValue([]);

      const results = await searchUseCase.execute(request);
      expect(results).toEqual([]);
    });

    it('should handle empty search results', async () => {
      const request: SearchRequest = { query: 'nonexistent query' };
      mockSearchRepository.search.mockResolvedValue([]);

      const results = await searchUseCase.execute(request);
      expect(results).toEqual([]);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty query string', async () => {
      const request: SearchRequest = { query: '' };

      await expect(searchUseCase.execute(request)).rejects.toThrow('Search query is required');
      expect(mockSearchRepository.search).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only query string', async () => {
      const request: SearchRequest = { query: '   \n\t   ' };

      await expect(searchUseCase.execute(request)).rejects.toThrow('Search query is required');
    });

    it('should reject negative limit', async () => {
      const request: SearchRequest = { query: 'test query', limit: -5 };

      await expect(searchUseCase.execute(request)).rejects.toThrow('Search limit must be positive');
    });

    it('should reject zero limit', async () => {
      const request: SearchRequest = { query: 'test query', limit: 0 };

      await expect(searchUseCase.execute(request)).rejects.toThrow('Search limit must be positive');
    });

    it('should reject invalid threshold', async () => {
      const request1: SearchRequest = { query: 'test query', threshold: -0.1 };
      const request2: SearchRequest = { query: 'test query', threshold: 1.5 };

      await expect(searchUseCase.execute(request1)).rejects.toThrow('Search threshold must be between 0 and 1');
      await expect(searchUseCase.execute(request2)).rejects.toThrow('Search threshold must be between 0 and 1');
    });

    it('should accept valid threshold boundaries', async () => {
      const request1: SearchRequest = { query: 'test query', threshold: 0 };
      const request2: SearchRequest = { query: 'test query', threshold: 1 };

      mockSearchRepository.search.mockResolvedValue([]);

      await expect(searchUseCase.execute(request1)).resolves.toEqual([]);
      await expect(searchUseCase.execute(request2)).resolves.toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should propagate repository errors', async () => {
      const request: SearchRequest = { query: 'test query' };

      mockSearchRepository.search.mockRejectedValue(new Error('Database connection failed'));

      await expect(searchUseCase.execute(request)).rejects.toThrow('Database connection failed');
    });

    it('should propagate service errors', async () => {
      const request: SearchRequest = { query: 'test query' };

      mockSearchRepository.search.mockRejectedValue(new Error('Embedding model not available'));

      await expect(searchUseCase.execute(request)).rejects.toThrow('Embedding model not available');
    });
  });

  describe('Parameter Passthrough', () => {
    it('should pass all parameters correctly to repository', async () => {
      const request: SearchRequest = {
        query: 'complex search test',
        memoryTypes: ['project', 'research'],
        limit: 25,
        threshold: 0.65,
        includeGraphContext: false
      };

      mockSearchRepository.search.mockResolvedValue([]);
      await searchUseCase.execute(request);

      expect(mockSearchRepository.search).toHaveBeenCalledWith(request);
    });
  });
});
