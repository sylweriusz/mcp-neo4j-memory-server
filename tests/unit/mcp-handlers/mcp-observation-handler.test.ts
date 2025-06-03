/**
 * MCP Observation Handler Tests - INTERFACE RELIABILITY
 * Single responsibility: Test the MCP layer for observation operations  
 * Focus: Cover the 14.89% gap in the external interface that clients depend on
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpObservationHandler } from '../../../src/application/mcp-handlers/mcp-observation-handler';
import { DIContainer } from '../../../src/container/di-container';

// Mock the DI container
vi.mock('../../../src/container/di-container', () => ({
  DIContainer: {
    getInstance: vi.fn()
  }
}));

describe('McpObservationHandler - The MCP Observation Interface', () => {
  let handler: McpObservationHandler;
  let mockContainer: any;
  let mockObservationUseCase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock use case
    mockObservationUseCase = {
      executeMany: vi.fn()
    };
    
    // Setup mock container
    mockContainer = {
      getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
      getManageObservationsUseCase: vi.fn().mockReturnValue(mockObservationUseCase)
    };
    
    // Mock the static getInstance method
    (DIContainer.getInstance as any).mockReturnValue(mockContainer);
    
    handler = new McpObservationHandler();
  });

  describe('Add Operations', () => {
    it('should handle successful add operations', async () => {
      // Setup: Mock successful use case execution
      mockObservationUseCase.executeMany.mockResolvedValue({
        processed: 1,
        errors: []
      });

      const request = {
        operation: 'add' as const,
        observations: [
          {
            memoryId: 'mem123',
            contents: ['First observation', 'Second observation']
          }
        ]
      };

      // Execute
      const result = await handler.handleObservationManage(request);

      // Verify
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        memoryId: 'mem123',
        status: 'success',
        observations: {
          requested: 2,
          processed: 2
        }
      });
      expect(result.summary.memories_processed).toBe(1);
      expect(result.summary.memories_failed).toBe(0);
      expect(result.summary.observations_processed).toBe(2);
      expect(result._meta.database).toBe('test-db');
      expect(result._meta.operation).toBe('add');
    });

    it('should handle multiple memory add operations', async () => {
      // Setup: Mock multiple successful operations
      mockObservationUseCase.executeMany
        .mockResolvedValueOnce({ processed: 1, errors: [] })
        .mockResolvedValueOnce({ processed: 1, errors: [] })
        .mockResolvedValueOnce({ processed: 1, errors: [] });

      const request = {
        operation: 'add' as const,
        observations: [
          { memoryId: 'mem1', contents: ['Observation 1'] },
          { memoryId: 'mem2', contents: ['Observation 2', 'Observation 3'] },
          { memoryId: 'mem3', contents: ['Observation 4'] }
        ]
      };

      // Execute
      const result = await handler.handleObservationManage(request);

      // Verify
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.summary.memories_processed).toBe(3);
      expect(result.summary.memories_failed).toBe(0);
      expect(result.summary.observations_processed).toBe(4); // Total observation count
    });

    it('should handle failed add operations', async () => {
      // Setup: Mock use case failure
      mockObservationUseCase.executeMany.mockRejectedValue(
        new Error('Memory not found')
      );

      const request = {
        operation: 'add' as const,
        observations: [
          {
            memoryId: 'nonexistent',
            contents: ['Failed observation']
          }
        ]
      };

      // Execute
      const result = await handler.handleObservationManage(request);

      // Verify
      expect(result.success).toBe(true); // Handler doesn't fail, just reports errors
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        memoryId: 'nonexistent',
        status: 'failed',
        error: 'Memory not found'
      });
      expect(result.summary.memories_processed).toBe(0);
      expect(result.summary.memories_failed).toBe(1);
      expect(result.summary.observations_processed).toBe(0);
    });
  });

  describe('Delete Operations', () => {
    it('should handle successful delete operations', async () => {
      // Setup: Mock successful deletion
      mockObservationUseCase.executeMany.mockResolvedValue({
        processed: 1,
        errors: []
      });

      const request = {
        operation: 'delete' as const,
        observations: [
          {
            memoryId: 'mem456',
            contents: ['obs-id-1', 'obs-id-2'] // Observation IDs for deletion
          }
        ]
      };

      // Execute
      const result = await handler.handleObservationManage(request);

      // Verify
      expect(result.success).toBe(true);
      expect(result.results[0]).toMatchObject({
        memoryId: 'mem456',
        status: 'success',
        observations: {
          requested: 2,
          processed: 2
        }
      });
      expect(result._meta.operation).toBe('delete');
      expect(mockObservationUseCase.executeMany).toHaveBeenCalledWith('delete', [
        { memoryId: 'mem456', contents: ['obs-id-1', 'obs-id-2'] }
      ]);
    });

    it('should handle failed delete operations', async () => {
      // Setup: Mock deletion failure  
      mockObservationUseCase.executeMany.mockRejectedValue(
        new Error('Observation not found')
      );

      const request = {
        operation: 'delete' as const,
        observations: [
          {
            memoryId: 'mem789',
            contents: ['nonexistent-obs-id']
          }
        ]
      };

      // Execute
      const result = await handler.handleObservationManage(request);

      // Verify
      expect(result.results[0]).toMatchObject({
        memoryId: 'mem789',
        status: 'failed',
        error: 'Observation not found'
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty request arrays', async () => {
      const request = {
        operation: 'add' as const,
        observations: []
      };

      // Execute
      const result = await handler.handleObservationManage(request);

      // Verify
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.summary.memories_processed).toBe(0);
      expect(result.summary.memories_failed).toBe(0);
      expect(result.summary.observations_processed).toBe(0);
      expect(mockObservationUseCase.executeMany).not.toHaveBeenCalled();
    });

    it('should include proper metadata in responses', async () => {
      // Setup: Mock container state
      mockContainer.getCurrentDatabase.mockReturnValue({ database: 'production-db' });
      mockObservationUseCase.executeMany.mockResolvedValue({ processed: 1, errors: [] });

      const request = {
        operation: 'delete' as const,
        observations: [
          { memoryId: 'mem123', contents: ['obs1'] }
        ]
      };

      // Execute
      const result = await handler.handleObservationManage(request);

      // Verify metadata
      expect(result._meta).toMatchObject({
        database: 'production-db',
        operation: 'delete'
      });
      expect(result._meta.timestamp).toBeDefined();
      expect(new Date(result._meta.timestamp)).toBeInstanceOf(Date);
    });
  });
});
