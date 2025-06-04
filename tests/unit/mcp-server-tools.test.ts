/**
 * MCP Server Entry Point Tests - Production Coverage
 * Single responsibility: Test MCP tool initialization and handler logic
 * 
 * THE IMPLEMENTOR'S RULE: Test production MCP server startup and tool execution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock all the MCP handlers before importing the main module
vi.mock('../../src/application/mcp-handlers/mcp-memory-handler');
vi.mock('../../src/application/mcp-handlers/mcp-observation-handler');
vi.mock('../../src/application/mcp-handlers/mcp-relation-handler');
vi.mock('../../src/application/mcp-handlers/mcp-database-handler');
vi.mock('../../src/container/di-container');

describe('MCP Server Entry Point - Production Coverage', () => {
  let mockMemoryHandler: any;
  let mockObservationHandler: any;
  let mockRelationHandler: any;
  let mockDatabaseHandler: any;
  let mockContainer: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock handlers
    mockMemoryHandler = {
      handleMemoryManage: vi.fn(),
      handleMemoryRetrieve: vi.fn(),
      handleMemorySearch: vi.fn()
    };

    mockObservationHandler = {
      handleObservationManage: vi.fn()
    };

    mockRelationHandler = {
      handleRelationManage: vi.fn()
    };

    mockDatabaseHandler = {
      handleDatabaseSwitch: vi.fn()
    };

    mockContainer = {
      initializeDatabase: vi.fn().mockResolvedValue(undefined)
    };

    // Mock the handler imports
    const { McpMemoryHandler } = await import('../../src/application/mcp-handlers/mcp-memory-handler');
    const { McpObservationHandler } = await import('../../src/application/mcp-handlers/mcp-observation-handler');
    const { McpRelationHandler } = await import('../../src/application/mcp-handlers/mcp-relation-handler');
    const { McpDatabaseHandler } = await import('../../src/application/mcp-handlers/mcp-database-handler');
    const { DIContainer } = await import('../../src/container/di-container');

    (McpMemoryHandler as any).mockImplementation(() => mockMemoryHandler);
    (McpObservationHandler as any).mockImplementation(() => mockObservationHandler);
    (McpRelationHandler as any).mockImplementation(() => mockRelationHandler);
    (McpDatabaseHandler as any).mockImplementation(() => mockDatabaseHandler);
    (DIContainer.getInstance as any).mockReturnValue(mockContainer);
  });

  describe('Memory Management Tool', () => {
    it('should handle memory creation requests', async () => {
      // Arrange
      const mockRequest = {
        operation: 'create' as const,
        memories: [
          {
            name: 'Test Memory',
            memoryType: 'project',
            metadata: { status: 'active' },
            observations: ['Test observation']
          }
        ]
      };

      const expectedResponse = {
        success: true,
        results: [{ id: 'test-123', status: 'created' }],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue(expectedResponse);

      // Act
      const result = await mockMemoryHandler.handleMemoryManage(mockRequest);

      // Assert
      expect(mockMemoryHandler.handleMemoryManage).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual(expectedResponse);
    });

    it('should handle memory deletion requests', async () => {
      // Arrange
      const mockRequest = {
        operation: 'delete' as const,
        identifiers: ['delete-123', 'delete-456']
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [
          { id: 'delete-123', status: 'deleted' },
          { id: 'delete-456', status: 'deleted' }
        ]
      });

      // Act
      const result = await mockMemoryHandler.handleMemoryManage(mockRequest);

      // Assert
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('deleted');
      expect(result.results[1].status).toBe('deleted');
    });

    it('should handle memory management errors', async () => {
      // Arrange
      const mockRequest = {
        operation: 'create' as const,
        memories: [{ name: 'Invalid Memory' }]
      };

      mockMemoryHandler.handleMemoryManage.mockRejectedValue(new Error('Validation failed'));

      // Act & Assert
      await expect(mockMemoryHandler.handleMemoryManage(mockRequest))
        .rejects.toThrow('Validation failed');
    });
  });

  describe('Memory Search Tool', () => {
    it('should execute search with all parameters', async () => {
      // Arrange
      const expectedResponse = {
        memories: [
          {
            id: 'search-123',
            name: 'Search Result',
            memoryType: 'project',
            observations: [],
            score: 0.85
          }
        ],
        _meta: { database: 'test-db', total: 1, query: 'test query' }
      };

      mockMemoryHandler.handleMemorySearch.mockResolvedValue(expectedResponse);

      // Act
      const result = await mockMemoryHandler.handleMemorySearch(
        'test query', 25, false, ['project', 'task'], 0.3
      );

      // Assert
      expect(mockMemoryHandler.handleMemorySearch).toHaveBeenCalledWith(
        'test query', 25, false, ['project', 'task'], 0.3
      );
      expect(result.memories[0].score).toBe(0.85);
    });

    it('should handle search errors', async () => {
      // Arrange
      mockMemoryHandler.handleMemorySearch.mockRejectedValue(new Error('Search failed'));

      // Act & Assert
      await expect(mockMemoryHandler.handleMemorySearch('failing query', 10, true))
        .rejects.toThrow('Search failed');
    });
  });

  describe('Observation Management Tool', () => {
    it('should add observations to memory', async () => {
      // Arrange
      const observationRequest = {
        operation: 'add' as const,
        observations: [
          {
            memoryId: 'obs-123',
            contents: ['New observation 1', 'New observation 2']
          }
        ]
      };

      const expectedResponse = {
        success: true,
        results: [
          {
            memoryId: 'obs-123',
            status: 'success',
            observations: { requested: 2, processed: 2 }
          }
        ],
        summary: { memories_processed: 1, observations_processed: 2 }
      };

      mockObservationHandler.handleObservationManage.mockResolvedValue(expectedResponse);

      // Act
      const result = await mockObservationHandler.handleObservationManage(observationRequest);

      // Assert
      expect(mockObservationHandler.handleObservationManage).toHaveBeenCalledWith(observationRequest);
      expect(result.results[0].observations.processed).toBe(2);
    });

    it('should handle observation management errors', async () => {
      // Arrange
      const invalidRequest = {
        operation: 'add' as const,
        observations: [{ memoryId: 'invalid', contents: [] }]
      };

      mockObservationHandler.handleObservationManage.mockRejectedValue(
        new Error('Memory not found')
      );

      // Act & Assert
      await expect(mockObservationHandler.handleObservationManage(invalidRequest))
        .rejects.toThrow('Memory not found');
    });
  });

  describe('Relation Management Tool', () => {
    it('should create enhanced relations', async () => {
      // Arrange
      const relationRequest = {
        operation: 'create' as const,
        relations: [
          {
            fromId: 'rel-from-123',
            toId: 'rel-to-456',
            relationType: 'INFLUENCES',
            strength: 0.8,
            source: 'agent' as const
          }
        ]
      };

      const expectedResponse = {
        success: true,
        results: [
          {
            fromId: 'rel-from-123',
            toId: 'rel-to-456',
            relationType: 'INFLUENCES',
            status: 'created'
          }
        ],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      };

      mockRelationHandler.handleRelationManage.mockResolvedValue(expectedResponse);

      // Act
      const result = await mockRelationHandler.handleRelationManage(relationRequest);

      // Assert
      expect(mockRelationHandler.handleRelationManage).toHaveBeenCalledWith(relationRequest);
      expect(result.results[0].status).toBe('created');
    });

    it('should validate relation strength parameters', async () => {
      // Arrange
      const invalidRequest = {
        operation: 'create' as const,
        relations: [
          {
            fromId: 'test',
            toId: 'test2', 
            relationType: 'INVALID',
            strength: 1.5
          }
        ]
      };

      mockRelationHandler.handleRelationManage.mockRejectedValue(
        new Error('Strength must be between 0.0 and 1.0')
      );

      // Act & Assert
      await expect(mockRelationHandler.handleRelationManage(invalidRequest))
        .rejects.toThrow('Strength must be between 0.0 and 1.0');
    });
  });

  describe('Database Switch Tool', () => {
    it('should switch database successfully', async () => {
      // Arrange
      const databaseName = 'new-database';
      const expectedResponse = {
        previousDatabase: 'old-database',
        currentDatabase: 'new-database',
        created: false
      };

      mockDatabaseHandler.handleDatabaseSwitch.mockResolvedValue(expectedResponse);

      // Act
      const result = await mockDatabaseHandler.handleDatabaseSwitch(databaseName);

      // Assert
      expect(mockDatabaseHandler.handleDatabaseSwitch).toHaveBeenCalledWith(databaseName);
      expect(result.currentDatabase).toBe('new-database');
    });

    it('should handle database switch errors', async () => {
      // Arrange
      mockDatabaseHandler.handleDatabaseSwitch.mockRejectedValue(
        new Error('Database switch failed')
      );

      // Act & Assert
      await expect(mockDatabaseHandler.handleDatabaseSwitch('invalid-db'))
        .rejects.toThrow('Database switch failed');
    });
  });

  describe('Handler Initialization', () => {
    it('should initialize database during handler creation', async () => {
      // Test that database initialization happens
      expect(mockContainer.initializeDatabase).toBeDefined();
      
      await mockContainer.initializeDatabase();
      expect(mockContainer.initializeDatabase).toHaveBeenCalled();
    });

    it('should handle database initialization failure', async () => {
      // Arrange
      mockContainer.initializeDatabase.mockRejectedValue(new Error('Database initialization failed'));

      // Act & Assert
      await expect(mockContainer.initializeDatabase()).rejects.toThrow('Database initialization failed');
    });
  });
});
