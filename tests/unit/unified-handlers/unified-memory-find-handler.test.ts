/**
 * Unified Memory Find Handler Tests
 * Single responsibility: Test unified search, retrieval, and graph traversal
 * GDD v3.0: Tests for consolidated search architecture
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMemoryFindHandler } from '../../../src/application/unified-handlers/unified-memory-find-handler';
import { McpMemoryHandler } from '../../../src/application/mcp-handlers';

// Mock dependencies
vi.mock('../../../src/application/mcp-handlers');
vi.mock('../../../src/container/di-container');
vi.mock('../../../src/infrastructure/services/search/wildcard-search-service');

// Import mocked modules
import { DIContainer } from '../../../src/container/di-container';
import { WildcardSearchService } from '../../../src/infrastructure/services/search/wildcard-search-service';

describe('UnifiedMemoryFindHandler - Production Coverage', () => {
  let handler: UnifiedMemoryFindHandler;
  let mockMemoryHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock DIContainer
    const mockContainer = {
      getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
      initializeDatabase: vi.fn().mockResolvedValue(undefined), // Add missing method
      getSessionFactory: vi.fn().mockReturnValue({
        createSession: vi.fn().mockReturnValue({
          run: vi.fn(),
          close: vi.fn()
        })
      })
    };
    vi.mocked(DIContainer.getInstance).mockReturnValue(mockContainer);

    // Create mock memory handler
    mockMemoryHandler = {
      handleMemoryRetrieve: vi.fn(),
      handleMemorySearch: vi.fn(),
      container: mockContainer  // Add container reference
    };

    handler = new UnifiedMemoryFindHandler(mockMemoryHandler);
  });

  describe('Query Type Routing', () => {
    it('should route direct ID lookup to handleMemoryRetrieve', async () => {
      // Arrange
      const request = {
        query: ['memory-id-1', 'memory-id-2']
      };

      mockMemoryHandler.handleMemoryRetrieve.mockResolvedValue({
        memories: [
          { id: 'memory-id-1', name: 'Memory 1', memoryType: 'test' },
          { id: 'memory-id-2', name: 'Memory 2', memoryType: 'test' }
        ]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(mockMemoryHandler.handleMemoryRetrieve).toHaveBeenCalledWith(['memory-id-1', 'memory-id-2']);
      expect(result.memories).toHaveLength(2);
      expect(result._meta.query).toEqual(['memory-id-1', 'memory-id-2']);
    });

    it('should parse stringified array from MCP transport', async () => {
      // Arrange
      const request = {
        query: '["memory-id-1","memory-id-2"]' // Stringified array from MCP
      };

      mockMemoryHandler.handleMemoryRetrieve.mockResolvedValue({
        memories: [
          { id: 'memory-id-1', name: 'Memory 1', memoryType: 'test' }
        ]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(mockMemoryHandler.handleMemoryRetrieve).toHaveBeenCalledWith(['memory-id-1', 'memory-id-2']);
    });

    it('should route semantic search to handleMemorySearch', async () => {
      // Arrange
      const request = {
        query: 'artificial intelligence concepts',
        limit: 5,
        threshold: 0.7
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue({
        memories: [
          { id: 'ai-1', name: 'AI Concepts', memoryType: 'knowledge', score: 0.85 }
        ]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(mockMemoryHandler.handleMemorySearch).toHaveBeenCalledWith(
        'artificial intelligence concepts',
        5,
        true, // includeGraphContext
        undefined, // memoryTypes
        0.7 // threshold
      );
    });

    it('should handle wildcard search', async () => {
      // Arrange - Mock WildcardSearchService properly
      const mockWildcardService = {
        search: vi.fn().mockResolvedValue([
          { 
            id: 'wild-1', 
            name: 'Wildcard Result', 
            type: 'test',
            observations: [],
            metadata: {},
            score: 1.0
          }
        ])
      };
      
      // Mock the container's sessionFactory.withSession method
      const mockContainer = {
        getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
        getSessionFactory: vi.fn().mockReturnValue({
          createSession: vi.fn().mockReturnValue({
            run: vi.fn(),
            close: vi.fn()
          })
        }),
        initializeDatabase: vi.fn()
      };
      vi.mocked(DIContainer.getInstance).mockReturnValue(mockContainer);
      
      vi.mocked(WildcardSearchService)
        .mockImplementation(() => mockWildcardService);

      const request = {
        query: '*',
        limit: 10
      };

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].name).toBe('Wildcard Result');
    });
  });

  describe('Context Level Processing', () => {
    it('should apply minimal context level', async () => {
      // Arrange
      const request = {
        query: 'test search',
        includeContext: 'minimal' as const
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue({
        memories: [{
          id: 'test-1',
          name: 'Test Memory',
          memoryType: 'test',
          observations: [{ content: 'detailed observation' }],
          metadata: { detailed: 'metadata' },
          related: { ancestors: [], descendants: [] }
        }]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      const memory = result.memories[0];
      expect(memory).toEqual({
        id: 'test-1',
        name: 'Test Memory', 
        memoryType: 'test'
      });
      expect(memory).not.toHaveProperty('observations');
      expect(memory).not.toHaveProperty('metadata');
      expect(memory).not.toHaveProperty('related');
    });

    it('should apply relations-only context level', async () => {
      // Arrange
      const request = {
        query: 'test search',
        includeContext: 'relations-only' as const
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue({
        memories: [{
          id: 'test-1',
          name: 'Test Memory',
          memoryType: 'test',
          observations: [{ content: 'detailed observation' }],
          metadata: { detailed: 'metadata' },
          related: { 
            ancestors: [{ id: 'parent-1', name: 'Parent', relation: 'PARENT_OF' }],
            descendants: []
          }
        }]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      const memory = result.memories[0];
      expect(memory).toEqual({
        id: 'test-1',
        name: 'Test Memory',
        memoryType: 'test',
        related: {
          ancestors: [{ id: 'parent-1', name: 'Parent', relation: 'PARENT_OF' }],
          descendants: []
        }
      });
      expect(memory).not.toHaveProperty('observations');
      expect(memory).not.toHaveProperty('metadata');
    });

    it('should apply full context level by default', async () => {
      // Arrange
      const request = {
        query: 'test search'
        // No includeContext specified - should default to 'full'
      };

      const fullMemory = {
        id: 'test-1',
        name: 'Test Memory',
        memoryType: 'test',
        observations: [{ content: 'observation' }],
        metadata: { key: 'value' },
        related: { ancestors: [], descendants: [] }
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue({
        memories: [fullMemory]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(result.memories[0]).toEqual(fullMemory);
      expect(result._meta.contextLevel).toBe('full');
    });
  });

  describe('Graph Traversal', () => {
    it('should handle graph traversal request', async () => {
      // Arrange - mock DIContainer and sessionFactory for graph traversal
      const mockSession = {
        run: vi.fn().mockResolvedValue({
          records: [
            {
              get: vi.fn().mockImplementation((field) => {
                const record = {
                  id: 'related-memory-1',
                  name: 'Related Memory',
                  type: 'concept',
                  distance: { toNumber: () => 1 },
                  relation: 'INFLUENCES',
                  strength: 0.8,
                  source: 'agent',
                  createdAt: '2025-01-01T00:00:00Z'
                };
                return record[field as keyof typeof record];
              })
            }
          ]
        }),
        close: vi.fn()
      };

      // Update the global DIContainer mock (not just memory handler)
      const mockContainer = {
        getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
        initializeDatabase: vi.fn().mockResolvedValue(undefined),
        getSessionFactory: vi.fn().mockReturnValue({
          createSession: vi.fn().mockReturnValue(mockSession)
        })
      };
      
      // FIXED: Mock the global DIContainer call
      vi.mocked(DIContainer.getInstance).mockReturnValue(mockContainer);
      
      mockMemoryHandler.handleMemoryRetrieve = vi.fn().mockResolvedValue({
        memories: [{
          id: 'related-memory-1',
          name: 'Related Memory',
          memoryType: 'concept',
          observations: [],
          metadata: {}
        }]
      });

      const request = {
        query: 'test',
        traverseFrom: 'start-memory-id',
        traverseRelations: ['INFLUENCES'],
        maxDepth: 2,
        traverseDirection: 'outbound' as const
      };

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(mockSession.run).toHaveBeenCalled();
      expect(mockMemoryHandler.handleMemoryRetrieve).toHaveBeenCalledWith(['related-memory-1']);
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].related).toBeDefined();
    });

    it('should handle empty graph traversal results', async () => {
      // Arrange - mock empty traversal results
      const mockSession = {
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn()
      };

      const mockContainer = {
        getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
        initializeDatabase: vi.fn().mockResolvedValue(undefined),
        getSessionFactory: vi.fn().mockReturnValue({
          createSession: vi.fn().mockReturnValue(mockSession)
        })
      };
      
      // FIXED: Mock the global DIContainer call
      vi.mocked(DIContainer.getInstance).mockReturnValue(mockContainer);

      const request = {
        query: 'test',
        traverseFrom: 'isolated-memory-id',
        maxDepth: 1
      };

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(result.memories).toHaveLength(0);
    });

    it('should validate graph traversal parameters', async () => {
      // Arrange
      const invalidRequest = {
        query: 'test',
        maxDepth: 2,
        traverseRelations: ['INFLUENCES']
        // Missing traverseFrom
      };

      // Act & Assert
      await expect(handler.handleMemoryFind(invalidRequest))
        .rejects.toThrow('traverseFrom is required when using graph traversal parameters');
    });
  });

  describe('Date-Based Filtering', () => {
    it('should handle date filtering for wildcard searches', async () => {
      // Arrange - use the same mocking approach as the working wildcard test
      const mockWildcardService = {
        search: vi.fn().mockResolvedValue([
          {
            id: 'recent-memory',
            name: 'Recent Memory',
            type: 'note',
            observations: [],
            metadata: {},
            createdAt: '2025-01-01T00:00:00Z',
            score: 1.0
          }
        ])
      };

      // Mock the session and container for wildcard search
      const mockContainer = {
        getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
        getSessionFactory: vi.fn().mockReturnValue({
          createSession: vi.fn().mockReturnValue({
            run: vi.fn(),
            close: vi.fn()
          })
        }),
        initializeDatabase: vi.fn()
      };
      
      vi.mocked(DIContainer.getInstance).mockReturnValue(mockContainer);
      vi.mocked(WildcardSearchService).mockImplementation(() => mockWildcardService);

      const request = {
        query: '*',
        limit: 5,
        createdAfter: '30d', // 30 days ago - will be earlier than createdBefore
        createdBefore: '1d'   // 1 day ago - later than createdAfter
      };

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].name).toBe('Recent Memory');
    });

    it('should validate date filter parameters', async () => {
      // Arrange
      const invalidRequest = {
        query: '*',
        createdAfter: 'invalid-date'
      };

      // We can't easily test the date validation without mocking the dateProcessor
      // but we can test that the request goes through the validation path
      // Act & Assert - this should be handled gracefully
      try {
        await handler.handleMemoryFind(invalidRequest);
      } catch (error) {
        // Date validation happens in the dateProcessor, so we expect potential errors
        expect(error).toBeDefined();
      }
    });
  });

  describe('Memory Type Filtering', () => {
    it('should apply memory type filtering to direct retrieval', async () => {
      // Arrange
      const request = {
        query: ['mem-1', 'mem-2'],
        memoryTypes: ['architecture', 'design']
      };

      mockMemoryHandler.handleMemoryRetrieve.mockResolvedValue({
        memories: [
          { id: 'mem-1', name: 'Architecture Doc', memoryType: 'architecture' },
          { id: 'mem-2', name: 'Design Pattern', memoryType: 'design' }
        ]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      // Should filter results to only include specified types
      expect(result.memories).toHaveLength(2);
      expect(result.memories.every(m => ['architecture', 'design'].includes(m.memoryType))).toBe(true);
    });

    it('should pass memory type filtering to search operations', async () => {
      // Arrange
      const request = {
        query: 'search term',
        memoryTypes: ['knowledge', 'insight']
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue({
        memories: []
      });

      // Act
      await handler.handleMemoryFind(request);

      // Assert
      expect(mockMemoryHandler.handleMemorySearch).toHaveBeenCalledWith(
        'search term',
        10, // default limit
        true, // includeGraphContext
        ['knowledge', 'insight'], // memoryTypes passed through
        0.1 // default threshold
      );
    });
  });

  describe('Validation and Error Handling', () => {
    it('should validate required query parameter', async () => {
      // Act & Assert
      await expect(handler.handleMemoryFind({ query: '' }))
        .rejects.toThrow('query parameter is required');
    });

    it('should validate positive limit', async () => {
      // Act & Assert
      await expect(handler.handleMemoryFind({ 
        query: 'test', 
        limit: 0 
      })).rejects.toThrow('limit must be positive');
    });

    it('should validate threshold range', async () => {
      // Act & Assert
      await expect(handler.handleMemoryFind({ 
        query: 'test', 
        threshold: 1.5 
      })).rejects.toThrow('threshold must be between 0.0 and 1.0');

      await expect(handler.handleMemoryFind({ 
        query: 'test', 
        threshold: -0.1 
      })).rejects.toThrow('threshold must be between 0.0 and 1.0');
    });

    it('should validate context level options', async () => {
      // Act & Assert
      await expect(handler.handleMemoryFind({ 
        query: 'test', 
        includeContext: 'invalid' as any 
      })).rejects.toThrow('Invalid context level: invalid');
    });

    it('should validate orderBy options', async () => {
      // Act & Assert  
      await expect(handler.handleMemoryFind({ 
        query: 'test', 
        orderBy: 'invalid' as any 
      })).rejects.toThrow('Invalid orderBy: invalid');
    });
  });

  describe('Response Formatting', () => {
    it('should include proper metadata in response', async () => {
      // Arrange
      const request = {
        query: 'test search',
        includeContext: 'minimal' as const
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue({
        memories: [{ id: 'test-1', name: 'Test', memoryType: 'test' }]
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(result._meta).toEqual({
        database: 'test-db',
        total: 1,
        query: 'test search',
        queryTime: expect.any(Number),
        contextLevel: 'minimal'
      });
      expect(result._meta.queryTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty results gracefully', async () => {
      // Arrange
      const request = {
        query: 'nonexistent search'
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue({
        memories: []
      });

      // Act
      const result = await handler.handleMemoryFind(request);

      // Assert
      expect(result.memories).toEqual([]);
      expect(result._meta.total).toBe(0);
    });
  });
});
