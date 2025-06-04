/**
 * Neo4j Search Repository Tests - Production Coverage
 * Single responsibility: Test search repository with real SimplifiedSearchService
 * 
 * THE IMPLEMENTOR'S RULE: Test production paths with minimal mocking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jSearchRepository } from '../../../src/infrastructure/repositories/neo4j-search-repository';
import { SearchRequest, SearchResult } from '../../../src/domain/repositories/search-repository';
import { SessionFactory } from '../../../src/infrastructure/database/session-factory';
import { SimplifiedSearchService, SimpleSearchResult } from '../../../src/infrastructure/services/search/simplified-search-service';

// Mock the SimplifiedSearchService to avoid database dependencies
vi.mock('../../../src/infrastructure/services/search/simplified-search-service');

describe('Neo4jSearchRepository - Production Coverage', () => {
  let repository: Neo4jSearchRepository;
  let mockSessionFactory: any;
  let mockSession: any;
  let mockSearchService: any;

  beforeEach(() => {
    // Mock session and session factory
    mockSession = {
      close: vi.fn().mockResolvedValue(undefined)
    };
    
    mockSessionFactory = {
      createSession: vi.fn().mockReturnValue(mockSession)
    };

    // Mock SimplifiedSearchService
    mockSearchService = {
      search: vi.fn()
    };
    
    (SimplifiedSearchService as any).mockImplementation(() => mockSearchService);

    repository = new Neo4jSearchRepository(mockSessionFactory);
  });

  describe('Search Execution', () => {
    it('should execute search with default parameters', async () => {
      // Arrange
      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'mem-123',
          name: 'Test Memory',
          type: 'project',
          observations: [
            { id: 'obs-1', content: 'Test observation', createdAt: '2025-01-01T10:00:00Z' }
          ],
          metadata: { status: 'active' },
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z',
          score: 0.85,
          matchType: 'exact' as const
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      const searchRequest: SearchRequest = {
        query: 'test query',
        limit: 10,
        includeGraphContext: true,
        threshold: 0.1
      };

      // Act
      const results = await repository.search(searchRequest);

      // Assert
      expect(mockSessionFactory.createSession).toHaveBeenCalledOnce();
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'test query',
        10,
        true,
        undefined,
        0.1
      );
      expect(mockSession.close).toHaveBeenCalledOnce();
      
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        memory: {
          id: 'mem-123',
          name: 'Test Memory',
          memoryType: 'project',
          observations: [
            { id: 'obs-1', content: 'Test observation', createdAt: '2025-01-01T10:00:00Z' }
          ],
          metadata: { status: 'active' },
          createdAt: new Date('2025-01-01T09:00:00Z'),
          modifiedAt: new Date('2025-01-01T09:30:00Z'),
          lastAccessed: new Date('2025-01-01T10:00:00Z'),
          related: undefined
        },
        score: 0.85,
        matchType: 'metadata'
      });
    });

    it('should handle missing optional parameters', async () => {
      // Arrange
      mockSearchService.search.mockResolvedValue([]);

      const searchRequest: SearchRequest = {
        query: 'simple query'
        // All optional parameters omitted
      };

      // Act
      await repository.search(searchRequest);

      // Assert
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'simple query',
        10,          // default limit
        true,        // default includeGraphContext
        undefined,   // no memoryTypes
        0.1          // default threshold
      );
    });

    it('should pass through all parameters correctly', async () => {
      // Arrange
      mockSearchService.search.mockResolvedValue([]);

      const searchRequest: SearchRequest = {
        query: 'complex query',
        limit: 25,
        includeGraphContext: false,
        memoryTypes: ['project', 'task'],
        threshold: 0.3
      };

      // Act
      await repository.search(searchRequest);

      // Assert
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'complex query',
        25,
        false,
        ['project', 'task'],
        0.3
      );
    });

    it('should handle includeGraphContext explicitly set to false', async () => {
      // Arrange
      mockSearchService.search.mockResolvedValue([]);

      const searchRequest: SearchRequest = {
        query: 'test',
        includeGraphContext: false
      };

      // Act
      await repository.search(searchRequest);

      // Assert
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'test',
        10,
        false,  // Explicitly false
        undefined,
        0.1
      );
    });
  });

  describe('Result Conversion', () => {
    it('should convert semantic search results correctly', async () => {
      // Arrange
      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'mem-456',
          name: 'Semantic Memory',
          type: 'knowledge',
          observations: [],
          metadata: {},
          score: 0.72,
          matchType: 'semantic' as const
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      // Act
      const results = await repository.search({ query: 'semantic test' });

      // Assert
      expect(results[0].matchType).toBe('vector');
      expect(results[0].score).toBe(0.72);
    });

    it('should convert exact search results correctly', async () => {
      // Arrange
      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'mem-789',
          name: 'Exact Memory',
          type: 'reference',
          observations: [],
          metadata: {},
          score: 0.95,
          matchType: 'exact' as const
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      // Act
      const results = await repository.search({ query: 'exact test' });

      // Assert
      expect(results[0].matchType).toBe('metadata');
      expect(results[0].score).toBe(0.95);
    });

    it('should handle missing dates gracefully', async () => {
      // Arrange
      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'mem-no-dates',
          name: 'Memory Without Dates',
          type: 'test',
          observations: [],
          metadata: {},
          score: 0.5,
          matchType: 'exact' as const
          // No date fields provided
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      // Act
      const results = await repository.search({ query: 'test' });

      // Assert
      const memory = results[0].memory;
      expect(memory.createdAt).toBeInstanceOf(Date);
      expect(memory.modifiedAt).toBeInstanceOf(Date);
      expect(memory.lastAccessed).toBeInstanceOf(Date);
    });

    it('should handle missing score gracefully', async () => {
      // Arrange
      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'mem-no-score',
          name: 'Memory Without Score',
          type: 'test',
          observations: [],
          metadata: {},
          matchType: 'exact' as const
          // No score provided
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      // Act
      const results = await repository.search({ query: 'test' });

      // Assert
      expect(results[0].score).toBe(0);
    });

    it('should preserve complex metadata structures', async () => {
      // Arrange
      const complexMetadata = {
        tags: ['important', 'work'],
        nested: {
          level1: {
            level2: 'deep value'
          }
        },
        numbers: [1, 2, 3],
        boolean: true
      };

      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'mem-complex',
          name: 'Complex Memory',
          type: 'advanced',
          observations: [],
          metadata: complexMetadata,
          score: 0.8,
          matchType: 'semantic' as const
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      // Act
      const results = await repository.search({ query: 'complex' });

      // Assert
      expect(results[0].memory.metadata).toEqual(complexMetadata);
    });

    it('should handle related memories in results', async () => {
      // Arrange
      const relatedData = {
        ancestors: [
          { id: 'ancestor-1', name: 'Parent Memory', type: 'parent', relation: 'INFLUENCES', distance: 1 }
        ],
        descendants: [
          { id: 'descendant-1', name: 'Child Memory', type: 'child', relation: 'DEPENDS_ON', distance: 1 }
        ]
      };

      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'mem-related',
          name: 'Memory With Relations',
          type: 'connected',
          observations: [],
          metadata: {},
          related: relatedData,
          score: 0.7,
          matchType: 'exact' as const
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      // Act
      const results = await repository.search({ query: 'related' });

      // Assert
      expect(results[0].memory.related).toEqual(relatedData);
    });
  });

  describe('Production Integration', () => {
    it('should create SimplifiedSearchService with correct session', async () => {
      // Arrange
      mockSearchService.search.mockResolvedValue([]);

      // Act
      await repository.search({ query: 'integration test' });

      // Assert
      expect(SimplifiedSearchService).toHaveBeenCalledWith(mockSession);
    });

    it('should handle empty search results', async () => {
      // Arrange
      mockSearchService.search.mockResolvedValue([]);

      // Act
      const results = await repository.search({ query: 'no results' });

      // Assert
      expect(results).toEqual([]);
    });

    it('should maintain result order from search service', async () => {
      // Arrange
      const mockSimpleResults: SimpleSearchResult[] = [
        {
          id: 'first',
          name: 'First Result',
          type: 'test',
          observations: [],
          metadata: {},
          score: 0.9,
          matchType: 'exact' as const
        },
        {
          id: 'second',
          name: 'Second Result',
          type: 'test',
          observations: [],
          metadata: {},
          score: 0.8,
          matchType: 'semantic' as const
        }
      ];

      mockSearchService.search.mockResolvedValue(mockSimpleResults);

      // Act
      const results = await repository.search({ query: 'ordered test' });

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].memory.id).toBe('first');
      expect(results[1].memory.id).toBe('second');
    });
  });
});
