/**
 * MCP Memory Handler Test Suite - Integration Layer Coverage
 * Target: Achieve 85% coverage for critical business logic
 * Scope: Memory management, search operations, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpMemoryHandler } from '../../../src/application/mcp-handlers/mcp-memory-handler';
import { DIContainer } from '../../../src/container/di-container';

// Mock the DIContainer to avoid database dependencies
vi.mock('../../../src/container/di-container');

describe('McpMemoryHandler - Integration Layer', () => {
  let handler: McpMemoryHandler;
  let mockContainer: any;
  let mockMemoryRepo: any;
  let mockSearchUseCase: any;
  let mockCreateUseCase: any;
  let mockUpdateUseCase: any;
  let mockDeleteUseCase: any;

  beforeEach(() => {
    // Setup mock repository and use cases
    mockMemoryRepo = {
      findByIds: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    };

    mockSearchUseCase = {
      execute: vi.fn()
    };

    mockCreateUseCase = {
      execute: vi.fn()
    };

    mockUpdateUseCase = {
      execute: vi.fn()
    };

    mockDeleteUseCase = {
      execute: vi.fn()
    };

    // Setup mock container
    mockContainer = {
      getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
      getMemoryRepository: vi.fn().mockReturnValue(mockMemoryRepo),
      getSearchMemoriesUseCase: vi.fn().mockReturnValue(mockSearchUseCase),
      getCreateMemoryUseCase: vi.fn().mockReturnValue(mockCreateUseCase),
      getUpdateMemoryUseCase: vi.fn().mockReturnValue(mockUpdateUseCase),
      getDeleteMemoryUseCase: vi.fn().mockReturnValue(mockDeleteUseCase)
    };

    (DIContainer.getInstance as any).mockReturnValue(mockContainer);
    handler = new McpMemoryHandler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Memory Management - Create', () => {
    it('should create memories successfully', async () => {
      const mockMemory = { id: 'test-id', name: 'Test Memory' };
      mockCreateUseCase.execute.mockResolvedValue(mockMemory);

      const request = {
        operation: 'create' as const,
        memories: [{ name: 'Test Memory', memoryType: 'note' }]
      };

      const result = await handler.handleMemoryManage(request);

      expect(mockCreateUseCase.execute).toHaveBeenCalledWith(request.memories[0]);
      expect(result).toMatchObject({
        success: true,
        results: [{ id: 'test-id', status: 'created' }],
        summary: {
          requested: 1,
          succeeded: 1,
          failed: 0
        },
        _meta: {
          database: 'test-db',
          operation: 'create'
        }
      });
    });

    it('should handle create failures gracefully', async () => {
      mockCreateUseCase.execute
        .mockResolvedValueOnce({ id: 'success-id' })
        .mockRejectedValueOnce(new Error('Creation failed'));

      const request = {
        operation: 'create' as const,
        memories: [
          { name: 'Success Memory', memoryType: 'note' },
          { name: 'Fail Memory', memoryType: 'note' }
        ]
      };

      const result = await handler.handleMemoryManage(request);

      expect(result.summary).toMatchObject({
        requested: 2,
        succeeded: 1,
        failed: 1
      });
      expect(result.results[1]).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('Creation failed')
      });
    });

    it('should reject empty memories array', async () => {
      const request = {
        operation: 'create' as const,
        memories: []
      };

      await expect(handler.handleMemoryManage(request))
        .rejects.toThrow('memories array cannot be empty');
    });

    it('should reject undefined memories array', async () => {
      const request = {
        operation: 'create' as const
      };

      await expect(handler.handleMemoryManage(request))
        .rejects.toThrow('memories array cannot be empty');
    });
  });

  describe('Memory Management - Update', () => {
    it('should update memories successfully', async () => {
      const mockMemory = { id: 'test-id', name: 'Updated Memory' };
      mockUpdateUseCase.execute.mockResolvedValue(mockMemory);

      const request = {
        operation: 'update' as const,
        updates: [{ id: 'test-id', name: 'Updated Memory' }]
      };

      const result = await handler.handleMemoryManage(request);

      expect(mockUpdateUseCase.execute).toHaveBeenCalledWith(request.updates[0]);
      expect(result).toMatchObject({
        success: true,
        results: [{ id: 'test-id', status: 'updated' }],
        summary: {
          requested: 1,
          succeeded: 1,
          failed: 0
        }
      });
    });

    it('should handle update failures gracefully', async () => {
      mockUpdateUseCase.execute.mockRejectedValue(new Error('Update failed'));

      const request = {
        operation: 'update' as const,
        updates: [{ id: 'test-id', name: 'Updated Memory' }]
      };

      const result = await handler.handleMemoryManage(request);

      expect(result.summary.failed).toBe(1);
      expect(result.results[0]).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('Update failed')
      });
    });

    it('should reject empty updates array', async () => {
      const request = {
        operation: 'update' as const,
        updates: []
      };

      await expect(handler.handleMemoryManage(request))
        .rejects.toThrow('updates array cannot be empty');
    });
  });

  describe('Memory Search', () => {
    it('should execute search successfully', async () => {
      const mockSearchResults = [
        {
          memory: { 
            id: 'search-result-1', 
            name: 'Search Result 1',
            nameEmbedding: [0.1, 0.2],
            observations: []
          },
          score: 0.95
        },
        {
          memory: { 
            id: 'search-result-2', 
            name: 'Search Result 2',
            nameEmbedding: [0.3, 0.4],
            observations: []
          },
          score: 0.87
        }
      ];

      mockSearchUseCase.execute.mockResolvedValue(mockSearchResults);

      const result = await handler.handleMemorySearch(
        'test query',
        10,
        true,
        ['note'],
        0.1
      );

      expect(mockSearchUseCase.execute).toHaveBeenCalledWith({
        query: 'test query',
        limit: 10,
        includeGraphContext: true,
        memoryTypes: ['note'],
        threshold: 0.1
      });

      expect(result).toMatchObject({
        memories: [
          { id: 'search-result-1', name: 'Search Result 1', score: 0.95 },
          { id: 'search-result-2', name: 'Search Result 2', score: 0.87 }
        ],
        _meta: {
          database: 'test-db',
          total: 2,
          query: 'test query',
          queryTime: expect.any(Number)
        }
      });

      // Verify embeddings are stripped from search results
      expect(result.memories[0]).not.toHaveProperty('nameEmbedding');
      expect(result.memories[1]).not.toHaveProperty('nameEmbedding');
    });

    it('should handle empty search results', async () => {
      mockSearchUseCase.execute.mockResolvedValue([]);

      const result = await handler.handleMemorySearch('no results query', 10, true);

      expect(result).toMatchObject({
        memories: [],
        _meta: {
          database: 'test-db',
          total: 0,
          query: 'no results query'
        }
      });
    });

    it('should use default parameters when not provided', async () => {
      mockSearchUseCase.execute.mockResolvedValue([]);

      await handler.handleMemorySearch('test', 5, false);

      expect(mockSearchUseCase.execute).toHaveBeenCalledWith({
        query: 'test',
        limit: 5,
        includeGraphContext: false,
        memoryTypes: undefined,
        threshold: undefined
      });
    });
  });

  describe('Embedding Stripping', () => {
    it('should strip nameEmbedding from memory objects', async () => {
      const memoryWithEmbedding = {
        id: 'test-id',
        name: 'Test Memory',
        nameEmbedding: [0.1, 0.2, 0.3, 0.4],
        metadata: { key: 'value' },
        observations: []
      };

      mockMemoryRepo.findByIds.mockResolvedValue([memoryWithEmbedding]);

      const result = await handler.handleMemoryRetrieve(['test-id']);

      expect(result.memories[0]).toEqual({
        id: 'test-id',
        name: 'Test Memory',
        metadata: { key: 'value' },
        observations: []
      });
      expect(result.memories[0]).not.toHaveProperty('nameEmbedding');
    });

    it('should handle memories without embeddings', async () => {
      const memoryWithoutEmbedding = {
        id: 'test-id',
        name: 'Test Memory',
        metadata: { key: 'value' },
        observations: []
      };

      mockMemoryRepo.findByIds.mockResolvedValue([memoryWithoutEmbedding]);

      const result = await handler.handleMemoryRetrieve(['test-id']);

      expect(result.memories[0]).toEqual({
        id: 'test-id',
        name: 'Test Memory',
        metadata: { key: 'value' },
        observations: []
      });
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid operations', async () => {
      const request = {
        operation: 'invalid' as any
      };

      await expect(handler.handleMemoryManage(request))
        .rejects.toThrow('Invalid operation: invalid');
    });

    it('should handle repository errors in retrieval', async () => {
      mockMemoryRepo.findByIds.mockRejectedValue(new Error('Database connection failed'));

      await expect(handler.handleMemoryRetrieve(['test-id']))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle search use case errors', async () => {
      mockSearchUseCase.execute.mockRejectedValue(new Error('Search service unavailable'));

      await expect(handler.handleMemorySearch('test', 10, true))
        .rejects.toThrow('Search service unavailable');
    });

    it('should handle missing memory names gracefully in create errors', async () => {
      mockCreateUseCase.execute.mockRejectedValue(new Error('Invalid memory'));

      const request = {
        operation: 'create' as const,
        memories: [{ memoryType: 'note' }] // Missing name
      };

      const result = await handler.handleMemoryManage(request);

      expect(result.results[0]).toMatchObject({
        id: 'unknown',
        status: 'failed',
        error: expect.stringContaining('Invalid memory')
      });
    });

    it('should handle missing IDs gracefully in update errors', async () => {
      mockUpdateUseCase.execute.mockRejectedValue(new Error('Memory not found'));

      const request = {
        operation: 'update' as const,
        updates: [{ name: 'Updated Memory' }] // Missing id
      };

      const result = await handler.handleMemoryManage(request);

      expect(result.results[0]).toMatchObject({
        id: 'unknown',
        status: 'failed',
        error: expect.stringContaining('Memory not found')
      });
    });
  });
});
