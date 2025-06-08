/**
 * Unified Memory Store Handler Tests
 * Single responsibility: Test unified memory creation with immediate relations
 * GDD v3.0: Tests for consolidated tool architecture
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMemoryStoreHandler } from '../../../src/application/unified-handlers/unified-memory-store-handler';
import { McpMemoryHandler, McpRelationHandler } from '../../../src/application/mcp-handlers';

// Mock dependencies
vi.mock('../../../src/application/mcp-handlers');
vi.mock('../../../src/container/di-container');
vi.mock('../../../src/config');
vi.mock('../../../src/id_generator');

// Import DIContainer to access the mock
import { DIContainer } from '../../../src/container/di-container';
import { getLimitsConfig } from '../../../src/config';
import { generateCompactId } from '../../../src/id_generator';

describe('UnifiedMemoryStoreHandler - Production Coverage', () => {
  let handler: UnifiedMemoryStoreHandler;
  let mockMemoryHandler: any;
  let mockRelationHandler: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock DIContainer
    const mockContainer = {
      getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
      getSessionFactory: vi.fn().mockReturnValue({
        createSession: vi.fn().mockReturnValue({
          beginTransaction: vi.fn().mockReturnValue({
            run: vi.fn(),
            commit: vi.fn(),
            rollback: vi.fn()
          }),
          close: vi.fn()
        })
      })
    };
    vi.mocked(DIContainer.getInstance).mockReturnValue(mockContainer);

    // Mock limits config
    vi.mocked(getLimitsConfig).mockReturnValue({
      maxMemoriesPerOperation: 50,
      maxRelationsPerOperation: 200
    });

    // Mock ID generator
    let idCounter = 0;
    vi.mocked(generateCompactId).mockImplementation(() => {
      return `test-id-${++idCounter}`;
    });

    // Create mock handlers
    mockMemoryHandler = {
      handleMemoryManage: vi.fn()
    };
    mockRelationHandler = {
      handleRelationManage: vi.fn()
    };

    handler = new UnifiedMemoryStoreHandler(mockMemoryHandler, mockRelationHandler);
  });

  describe('Memory Creation with LocalId Resolution', () => {
    it('should create memories and establish relations using localIds', async () => {
      // Arrange
      const request = {
        memories: [
          {
            name: 'Frontend Architecture',
            memoryType: 'architecture',
            localId: 'frontend',
            observations: ['React-based SPA'],
            metadata: { framework: 'react' }
          },
          {
            name: 'Backend Services',
            memoryType: 'architecture', 
            localId: 'backend',
            observations: ['Node.js API'],
            metadata: { framework: 'express' }
          }
        ],
        relations: [
          {
            from: 'frontend',
            to: 'backend',
            type: 'COMMUNICATES_WITH',
            strength: 0.9,
            source: 'agent'
          }
        ],
        options: {
          transactional: false  // Use non-transactional mode for simpler testing
        }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [
          { id: 'test-id-1', status: 'created' },
          { id: 'test-id-2', status: 'created' }
        ]
      });

      mockRelationHandler.handleRelationManage.mockResolvedValue({
        success: true,
        results: [
          { fromId: 'test-id-1', toId: 'test-id-2', relationType: 'COMMUNICATES_WITH', status: 'created' }
        ]
      });

      // Act
      const result = await handler.handleMemoryStore(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.created).toEqual(['test-id-1', 'test-id-2']);
      expect(result.connected).toHaveLength(1);
      expect(result.connected[0]).toEqual({
        from: 'test-id-1',
        to: 'test-id-2', 
        type: 'COMMUNICATES_WITH',
        strength: 0.9,
        source: 'agent'
      });
      expect(result.localIdMap).toEqual({
        frontend: 'test-id-1',
        backend: 'test-id-2'
      });
    });

    it('should handle mixed localId and existing memory ID references', async () => {
      // Arrange
      const request = {
        memories: [
          {
            name: 'New Component',
            memoryType: 'component',
            localId: 'newComp',
            observations: ['Vue component']
          }
        ],
        relations: [
          {
            from: 'newComp',
            to: 'existing-memory-123', // Existing memory ID
            type: 'EXTENDS',
            strength: 0.8
          }
        ],
        options: {
          transactional: false  // Use non-transactional mode for simpler testing
        }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [{ id: 'test-id-1', status: 'created' }]
      });

      mockRelationHandler.handleRelationManage.mockResolvedValue({
        success: true,
        results: [
          { fromId: 'test-id-1', toId: 'existing-memory-123', relationType: 'EXTENDS', status: 'created' }
        ]
      });

      // Act
      const result = await handler.handleMemoryStore(request);

      // Assert
      expect(result.success).toBe(true);
      expect(mockRelationHandler.handleRelationManage).toHaveBeenCalledWith({
        operation: 'create',
        relations: [{
          fromId: 'test-id-1',
          toId: 'existing-memory-123',
          relationType: 'EXTENDS',
          strength: 0.8,
          source: 'agent'
        }]
      });
    });
  });

  describe('Validation and Error Handling', () => {
    it('should validate memory requirements', async () => {
      // Arrange
      const invalidRequest = {
        memories: [] // Empty memories array
      };

      // Act
      const result = await handler.handleMemoryStore(invalidRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('memories array cannot be empty');
    });

    it('should validate memory limits', async () => {
      // Arrange
      const tooManyMemories = {
        memories: Array(51).fill({
          name: 'Test Memory',
          memoryType: 'test',
          observations: ['test observation']
        })
      };

      // Act
      const result = await handler.handleMemoryStore(tooManyMemories);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Too many memories: 51 > 50');
    });

    it('should validate relation limits', async () => {
      // Arrange
      const tooManyRelations = {
        memories: [{
          name: 'Test Memory',
          memoryType: 'test',
          observations: ['test']
        }],
        relations: Array(201).fill({
          from: 'test',
          to: 'test2',
          type: 'TEST'
        })
      };

      // Act
      const result = await handler.handleMemoryStore(tooManyRelations);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Too many relations: 201 > 200');
    });

    it('should validate localId uniqueness within request', async () => {
      // Arrange
      const duplicateLocalIds = {
        memories: [
          {
            name: 'Memory 1',
            memoryType: 'test',
            localId: 'duplicate',
            observations: ['test 1']
          },
          {
            name: 'Memory 2', 
            memoryType: 'test',
            localId: 'duplicate', // Same localId
            observations: ['test 2']
          }
        ]
      };

      // Act
      const result = await handler.handleMemoryStore(duplicateLocalIds);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Duplicate localId "duplicate" in request. LocalIds must be unique within a single operation.');
    });

    it('should validate memory name requirements', async () => {
      // Arrange
      const emptyNameRequest = {
        memories: [{
          name: '', // Empty name
          memoryType: 'test',
          observations: ['test']
        }]
      };

      // Act
      const result = await handler.handleMemoryStore(emptyNameRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Memory name cannot be empty');
    });

    it('should validate observations requirements', async () => {
      // Arrange
      const noObservationsRequest = {
        memories: [{
          name: 'Test Memory',
          memoryType: 'test',
          observations: [] // Empty observations
        }]
      };

      // Act
      const result = await handler.handleMemoryStore(noObservationsRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Memory "Test Memory" must have at least one observation');
    });
  });

  describe('Transactional Behavior', () => {
    it('should handle memory creation failure gracefully', async () => {
      // Arrange
      const request = {
        memories: [{
          name: 'Test Memory',
          memoryType: 'test',
          observations: ['test']
        }],
        options: {
          transactional: false  // Use non-transactional mode for easier testing
        }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: false,
        results: [{ id: 'test', status: 'failed', error: 'Creation failed' }]
      });

      // Act
      const result = await handler.handleMemoryStore(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Memory creation failed: Creation failed');
    });

    it('should handle relation creation failure after successful memory creation', async () => {
      // Arrange
      const request = {
        memories: [{
          name: 'Test Memory',
          memoryType: 'test',
          localId: 'test',
          observations: ['test']
        }],
        relations: [{
          from: 'test',
          to: 'non-existent',
          type: 'RELATES_TO'
        }],
        options: {
          transactional: false  // Use non-transactional mode for easier testing
        }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [{ id: 'test-id-1', status: 'created' }]
      });

      mockRelationHandler.handleRelationManage.mockResolvedValue({
        success: true,
        results: [{ 
          fromId: 'test-id-1', 
          toId: 'non-existent', 
          relationType: 'RELATES_TO',  // Add missing field
          status: 'failed', 
          error: 'Target not found' 
        }]
      });

      // Act
      const result = await handler.handleMemoryStore(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Relation creation failed: test-id-1 → non-existent (RELATES_TO): Target not found');
    });
  });

  describe('Default Options Handling', () => {
    it('should apply default options when none provided', async () => {
      // Arrange
      const request = {
        memories: [{
          name: 'Test Memory',
          memoryType: 'test',
          observations: ['test']
        }]
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [{ id: 'test-id-1', status: 'created' }]
      });

      // Act
      const result = await handler.handleMemoryStore(request);

      // Assert
      expect(result.limits).toEqual({
        memoriesLimit: 50,
        relationsLimit: 200
      });
    });

    it('should use custom options when provided', async () => {
      // Arrange
      const request = {
        memories: [{
          name: 'Test Memory',
          memoryType: 'test',
          observations: ['test']
        }],
        options: {
          maxMemories: 10,
          maxRelations: 50,
          transactional: false
        }
      };

      mockMemoryHandler.handleMemoryManage.mockResolvedValue({
        success: true,
        results: [{ id: 'test-id-1', status: 'created' }]
      });

      // Act
      const result = await handler.handleMemoryStore(request);

      // Assert
      expect(result.limits).toEqual({
        memoriesLimit: 10,
        relationsLimit: 50
      });
    });
  });
});
