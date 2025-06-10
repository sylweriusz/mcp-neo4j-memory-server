/**
 * MCP Relation Handler Tests - Production Coverage
 * Single responsibility: Test relation management operations
 * 
 * Test Coverage Target: 95%+ (Critical relationship functionality)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpRelationHandler } from '../../../src/application/mcp-handlers/mcp-relation-handler';
import { DIContainer } from '../../../src/container/di-container';

// Mock DIContainer to avoid database dependencies
vi.mock('../../../src/container/di-container');

describe('McpRelationHandler - Relationship Operations', () => {
  let handler: McpRelationHandler;
  let mockContainer: vi.Mocked<DIContainer>;
  let mockRelationUseCase: any;

  beforeEach(() => {
    mockRelationUseCase = {
      createRelation: vi.fn(),
      deleteRelation: vi.fn()
    };

    mockContainer = {
      initializeDatabase: vi.fn().mockResolvedValue(undefined),
      getManageRelationsUseCase: vi.fn().mockReturnValue(mockRelationUseCase),
      getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' })
    } as any;

    (DIContainer.getInstance as any).mockReturnValue(mockContainer);
    
    handler = new McpRelationHandler();
  });

  describe('handleRelationManage - Create Operations', () => {
    it('should create single relation successfully', async () => {
      // Arrange
      const request = {
        operation: 'create' as const,
        relations: [{
          fromId: 'Bm>test1234567890a',
          toId: 'Bm>test1234567890b',
          relationType: 'INFLUENCES'
        }]
      };

      mockRelationUseCase.createRelation.mockResolvedValue(undefined);

      // Act
      const result = await handler.handleRelationManage(request);

      // Assert
      expect(mockRelationUseCase.createRelation).toHaveBeenCalledWith(request.relations[0]);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        fromId: 'Bm>test1234567890a',
        toId: 'Bm>test1234567890b',
        relationType: 'INFLUENCES',
        status: 'created'
      });
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(0);
    });

    it('should create multiple relations successfully', async () => {
      // Arrange
      const request = {
        operation: 'create' as const,
        relations: [
          {
            fromId: 'Bm>test1234567890a',
            toId: 'Bm>test1234567890b',
            relationType: 'INFLUENCES'
          },
          {
            fromId: 'Bm>test1234567890b',
            toId: 'Bm>test1234567890c',
            relationType: 'DEPENDS_ON'
          }
        ]
      };

      mockRelationUseCase.createRelation.mockResolvedValue(undefined);

      // Act
      const result = await handler.handleRelationManage(request);

      // Assert
      expect(mockRelationUseCase.createRelation).toHaveBeenCalledTimes(2);
      expect(result.results).toHaveLength(2);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    it('should handle partial success during relation creation', async () => {
      // Arrange
      const request = {
        operation: 'create' as const,
        relations: [
          {
            fromId: 'Bm$existing1234567',
            toId: 'Bm$existing8765432',
            relationType: 'COMPLEMENTS'
          },
          {
            fromId: 'Bm$missing12345678',
            toId: 'Bm$existing8765432',
            relationType: 'RELATES_TO'
          }
        ]
      };

      mockRelationUseCase.createRelation
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Source memory not found'));

      // Act
      const result = await handler.handleRelationManage(request);

      // Assert
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('created');
      expect(result.results[1].status).toBe('failed');
      expect(result.results[1].error).toContain('Source memory not found');
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(1);
    });
  });

  describe('handleRelationManage - Delete Operations', () => {
    it('should delete single relation successfully', async () => {
      // Arrange
      const request = {
        operation: 'delete' as const,
        relations: [{
          fromId: 'Bm>test1234567890a',
          toId: 'Bm>test1234567890b',
          relationType: 'INFLUENCES'
        }]
      };

      mockRelationUseCase.deleteRelation.mockResolvedValue(undefined);

      // Act
      const result = await handler.handleRelationManage(request);

      // Assert
      expect(mockRelationUseCase.deleteRelation).toHaveBeenCalledWith(request.relations[0]);
      expect(result.results[0].status).toBe('deleted');
      expect(result.summary.succeeded).toBe(1);
    });

    it('should handle deletion errors gracefully', async () => {
      // Arrange
      const request = {
        operation: 'delete' as const,
        relations: [{
          fromId: 'Bm$nonexistent0001',
          toId: 'Bm>test1234567890b',
          relationType: 'INFLUENCES'
        }]
      };

      mockRelationUseCase.deleteRelation.mockRejectedValue(new Error('Relation not found'));

      // Act
      const result = await handler.handleRelationManage(request);

      // Assert
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toContain('Relation not found');
      expect(result.summary.failed).toBe(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection failures', async () => {
      // Arrange
      const request = {
        operation: 'create' as const,
        relations: [{
          fromId: 'Bm>test1234567890a',
          toId: 'Bm>test1234567890b',
          relationType: 'INFLUENCES'
        }]
      };

      mockRelationUseCase.createRelation.mockRejectedValue(new Error('Database connection failed'));

      // Act
      const result = await handler.handleRelationManage(request);

      // Assert
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toContain('Database connection failed');
    });

    it('should include proper metadata in response', async () => {
      // Arrange
      const request = {
        operation: 'create' as const,
        relations: [{
          fromId: 'Bm>test1234567890a',
          toId: 'Bm>test1234567890b',
          relationType: 'INFLUENCES'
        }]
      };

      mockRelationUseCase.createRelation.mockResolvedValue(undefined);

      // Act
      const result = await handler.handleRelationManage(request);

      // Assert
      expect(result._meta).toBeDefined();
      expect(result._meta.database).toBe('test-db');
      expect(result._meta.operation).toBe('create');
      expect(result._meta.timestamp).toBeDefined();
      expect(new Date(result._meta.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle empty relations array', async () => {
      // Arrange
      const request = {
        operation: 'create' as const,
        relations: []
      };

      // Act & Assert
      await expect(handler.handleRelationManage(request))
        .rejects.toThrow('Relations array is required and cannot be empty');
    });
  });
});
