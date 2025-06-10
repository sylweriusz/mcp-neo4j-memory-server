/**
 * Unified Memory Modify Handler Tests
 * Single responsibility: Test unified modification operations  
 * GDD v3.0: Tests for consolidated modification architecture
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMemoryModifyHandler } from '../../../src/application/unified-handlers/unified-memory-modify-handler';
import { 
  McpMemoryHandler, 
  McpObservationHandler, 
  McpRelationHandler,
  McpDatabaseHandler 
} from '../../../src/application/mcp-handlers';

// Mock dependencies
vi.mock('../../../src/application/mcp-handlers');
vi.mock('../../../src/container/di-container');
vi.mock('../../../src/infrastructure/repositories/memory/relation-repository');

// Import mocked modules
import { DIContainer } from '../../../src/container/di-container';
import { RelationRepository } from '../../../src/infrastructure/repositories/memory/relation-repository';

describe('UnifiedMemoryModifyHandler - Production Coverage', () => {
  let handler: UnifiedMemoryModifyHandler;
  let mockMemoryHandler: any;
  let mockObservationHandler: any;
  let mockRelationHandler: any;
  let mockDatabaseHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock DIContainer
    const mockContainer = {
      getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
      getSessionFactory: vi.fn().mockReturnValue({
        createSession: vi.fn().mockReturnValue({
          run: vi.fn(),
          close: vi.fn()
        })
      })
    };
    vi.mocked(DIContainer.getInstance).mockReturnValue(mockContainer);

    // Create mock handlers
    mockMemoryHandler = {
      handleMemoryManage: vi.fn()
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

    handler = new UnifiedMemoryModifyHandler(
      mockMemoryHandler,
      mockObservationHandler,
      mockRelationHandler,
      mockDatabaseHandler
    );
  });

  describe('Memory Operations', () => {
    it('should handle memory update operation', async () => {
      // Arrange
      const request = {
        operation: 'update' as const,
        target: 'memory-123',
        changes: {
          name: 'Updated Memory Name',
          memoryType: 'updated-type',
          metadata: { updated: true }
        }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [{ id: 'memory-123', status: 'updated' }],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(mockMemoryHandler.handleMemoryManage).toHaveBeenCalledWith({
        operation: 'update',
        updates: [{
          id: 'memory-123',
          name: 'Updated Memory Name',
          memoryType: 'updated-type',
          metadata: { updated: true }
        }]
      });
      expect(result.success).toBe(true);
      expect(result.results[0].status).toBe('updated');
    });

    it('should handle memory delete operation', async () => {
      // Arrange
      const request = {
        operation: 'delete' as const,
        target: 'memory-123'
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [{ id: 'memory-123', status: 'deleted' }],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(mockMemoryHandler.handleMemoryManage).toHaveBeenCalledWith({
        operation: 'delete',
        identifiers: ['memory-123']
      });
      expect(result.success).toBe(true);
    });

    it('should handle batch delete operation', async () => {
      // Arrange
      const request = {
        operation: 'batch-delete' as const,
        targets: ['memory-1', 'memory-2', 'memory-3']
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [
          { id: 'memory-1', status: 'deleted' },
          { id: 'memory-2', status: 'deleted' },
          { id: 'memory-3', status: 'deleted' }
        ],
        summary: { requested: 3, succeeded: 3, failed: 0 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(mockMemoryHandler.handleMemoryManage).toHaveBeenCalledWith({
        operation: 'delete',
        identifiers: ['memory-1', 'memory-2', 'memory-3']
      });
      expect(result.summary.succeeded).toBe(3);
    });
  });

  describe('Observation Operations', () => {
    it('should handle add observations operation', async () => {
      // Arrange
      const request = {
        operation: 'add-observations' as const,
        observations: [
          {
            memoryId: 'memory-123',
            contents: ['New observation 1', 'New observation 2']
          }
        ]
      };

      mockObservationHandler.handleObservationManage.mockResolvedValue({
        success: true,
        results: [{ memoryId: 'memory-123', status: 'success' }],
        summary: { memories_processed: 1, observations_processed: 2 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(mockObservationHandler.handleObservationManage).toHaveBeenCalledWith({
        operation: 'add',
        observations: request.observations
      });
      expect(result.success).toBe(true);
    });

    it('should handle delete observations operation', async () => {
      // Arrange
      const request = {
        operation: 'delete-observations' as const,
        observations: [
          {
            memoryId: 'memory-123',
            contents: ['obs-id-1', 'obs-id-2'] // Observation IDs for deletion
          }
        ]
      };

      mockObservationHandler.handleObservationManage.mockResolvedValue({
        success: true,
        results: [{ memoryId: 'memory-123', status: 'success' }],
        summary: { memories_processed: 1, observations_processed: 2 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(mockObservationHandler.handleObservationManage).toHaveBeenCalledWith({
        operation: 'delete',
        observations: request.observations
      });
    });
  });

  describe('Relation Operations', () => {
    it('should handle create relations operation', async () => {
      // Arrange
      const request = {
        operation: 'create-relations' as const,
        relations: [
          {
            from: 'memory-1',
            to: 'memory-2',
            type: 'INFLUENCES',
            strength: 0.8,
            source: 'agent' as const
          }
        ]
      };

      mockRelationHandler.handleRelationManage.mockResolvedValue({
        success: true,
        results: [{ fromId: 'memory-1', toId: 'memory-2', relationType: 'INFLUENCES', status: 'created' }],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(mockRelationHandler.handleRelationManage).toHaveBeenCalledWith({
        operation: 'create',
        relations: [{
          fromId: 'memory-1',
          toId: 'memory-2',
          relationType: 'INFLUENCES',
          strength: 0.8,
          source: 'agent'
        }]
      });
    });

    it('should handle delete relations operation', async () => {
      // Arrange
      const request = {
        operation: 'delete-relations' as const,
        relations: [
          {
            from: 'memory-1',
            to: 'memory-2',
            type: 'INFLUENCES'
          }
        ]
      };

      mockRelationHandler.handleRelationManage.mockResolvedValue({
        success: true,
        results: [{ fromId: 'memory-1', toId: 'memory-2', relationType: 'INFLUENCES', status: 'deleted' }],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(mockRelationHandler.handleRelationManage).toHaveBeenCalledWith({
        operation: 'delete',
        relations: [{
          fromId: 'memory-1',
          toId: 'memory-2',
          relationType: 'INFLUENCES'
        }]
      });
    });

    it('should handle update relations operation with direct repository access', async () => {
      // Arrange
      const mockRelationRepo = {
        updateEnhancedRelation: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(RelationRepository)
        .mockImplementation(() => mockRelationRepo);

      const request = {
        operation: 'update-relations' as const,
        relations: [
          {
            from: 'memory-1',
            to: 'memory-2',
            type: 'INFLUENCES',
            strength: 0.9,
            source: 'user' as const
          }
        ]
      };

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.results[0].status).toBe('updated');
    });
  });

  describe('Validation and Error Handling', () => {
    it('should validate operation parameter', async () => {
      // Act & Assert
      await expect(handler.handleMemoryModify({ operation: undefined as any }))
        .rejects.toThrow('operation is required');
    });

    it('should validate target for update operation', async () => {
      // Act & Assert
      await expect(handler.handleMemoryModify({
        operation: 'update',
        changes: { name: 'test' }
      })).rejects.toThrow('update operation requires target parameter');
    });

    it('should validate targets for batch-delete operation', async () => {
      // Act & Assert
      await expect(handler.handleMemoryModify({
        operation: 'batch-delete'
      })).rejects.toThrow('batch-delete operation requires targets array');
    });

    it('should validate observations for observation operations', async () => {
      // Act & Assert
      await expect(handler.handleMemoryModify({
        operation: 'add-observations'
      })).rejects.toThrow('add-observations operation requires observations array');
    });

    it('should validate relations for relation operations', async () => {
      // Act & Assert
      await expect(handler.handleMemoryModify({
        operation: 'create-relations'
      })).rejects.toThrow('create-relations operation requires relations array');
    });

    it('should handle unknown operation gracefully', async () => {
      // Act & Assert
      await expect(handler.handleMemoryModify({
        operation: 'invalid-operation' as any
      })).rejects.toThrow('Unknown operation: invalid-operation');
    });
  });

  describe('Error Response Formatting', () => {
    it('should build error response when operation fails', async () => {
      // Arrange
      const request = {
        operation: 'update' as const,
        target: 'memory-123',
        changes: { name: 'test' }
      };

      // Mock update to fail
      mockMemoryHandler.handleMemoryManage.mockRejectedValue(new Error('Update failed'));

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toBe('Update failed');
      expect(result.summary.failed).toBe(1);
    });

    it('should include metadata in all responses', async () => {
      // Arrange
      const request = {
        operation: 'update' as const,
        target: 'memory-123',
        changes: { name: 'test' }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [{ id: 'memory-123', status: 'updated' }],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      });

      // Act
      const result = await handler.handleMemoryModify(request);

      // Assert
      expect(result._meta).toEqual({
        database: 'test-db',
        operation: 'update',
        timestamp: expect.any(String)
      });
      expect(new Date(result._meta.timestamp)).toBeInstanceOf(Date);
    });
  });
});
