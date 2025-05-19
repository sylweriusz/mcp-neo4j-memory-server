import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsolidatedToolHandlers } from '../src/consolidated/handlers';
import { Neo4jKnowledgeGraphManager } from '../src/manager';

// Mock the utils module
vi.mock('../src/utils', () => ({
  stripEmbeddings: vi.fn().mockImplementation((entities) => {
    if (!entities) return entities;
    
    if (Array.isArray(entities)) {
      return entities.map(entity => {
        if (!entity) return entity;
        const { nameEmbedding, ...rest } = entity;
        return rest;
      });
    }
    
    if (entities.nameEmbedding) {
      const { nameEmbedding, ...rest } = entities;
      return rest;
    }
    
    return entities;
  })
}));

// Mock the Neo4jKnowledgeGraphManager for testing
const mockManager = {
  createMemories: vi.fn(),
  deleteMemories: vi.fn(),
  updateMemoryMetadata: vi.fn(),
  addObservations: vi.fn(),
  deleteObservations: vi.fn(),
  createRelations: vi.fn(),
  deleteRelations: vi.fn(),
  retrieveMemories: vi.fn(),
  searchMemories: vi.fn()
} as any;

describe('ConsolidatedToolHandlers', () => {
  let handlers: ConsolidatedToolHandlers;

  beforeEach(() => {
    handlers = new ConsolidatedToolHandlers(mockManager);
    vi.clearAllMocks();
  });

  describe('handleMemoryManage', () => {
    it('should handle create operation', async () => {
      const mockCreatedMemories = [
        { id: 'test-id', name: 'Test Memory', memoryType: 'test', observations: ['test obs'] }
      ];
      
      mockManager.createMemories.mockResolvedValue(mockCreatedMemories);

      const request = {
        operation: 'create' as const,
        memories: [
          {
            name: 'Test Memory',
            memoryType: 'test',
            observations: ['test obs']
          }
        ]
      };

      const result = await handlers.handleMemoryManage(request);

      expect(mockManager.createMemories).toHaveBeenCalledWith(request.memories);
      expect(result).toEqual(mockCreatedMemories);
    });

    it('should handle update operation', async () => {
      mockManager.updateMemoryMetadata.mockResolvedValue(undefined);

      const request = {
        operation: 'update' as const,
        updates: [
          {
            id: 'test-id',
            metadata: { status: 'updated' }
          }
        ]
      };

      const result = await handlers.handleMemoryManage(request);

      expect(mockManager.updateMemoryMetadata).toHaveBeenCalledWith('test-id', { status: 'updated' });
      expect(result).toEqual([
        {
          id: 'test-id',
          updated: true
        }
      ]);
    });

    it('should handle delete operation', async () => {
      mockManager.deleteMemories.mockResolvedValue(undefined);

      const request = {
        operation: 'delete' as const,
        identifiers: ['id1', 'id2']
      };

      const result = await handlers.handleMemoryManage(request);

      expect(mockManager.deleteMemories).toHaveBeenCalledWith(['id1', 'id2']);
      expect(result).toEqual({
        deletedCount: 2
      });
    });
  });

  describe('handleObservationManage', () => {
    it('should handle add operation', async () => {
      const mockResult = [
        { memoryId: 'test-id', contents: ['obs1', 'obs2'] }
      ];
      
      mockManager.addObservations.mockResolvedValue(mockResult);

      const request = {
        operation: 'add' as const,
        observations: [
          { memoryId: 'test-id', contents: ['obs1', 'obs2'] }
        ]
      };

      const result = await handlers.handleObservationManage(request);

      expect(mockManager.addObservations).toHaveBeenCalledWith(request.observations);
      expect(result).toEqual([
        {
          memoryId: 'test-id',
          contents: ['obs1', 'obs2'],
          addedCount: 2
        }
      ]);
    });

    it('should handle delete operation', async () => {
      mockManager.deleteObservations.mockResolvedValue(undefined);

      const request = {
        operation: 'delete' as const,
        observations: [
          { memoryId: 'test-id', contents: ['obs1'] }
        ]
      };

      const result = await handlers.handleObservationManage(request);

      expect(mockManager.deleteObservations).toHaveBeenCalledWith([
        { memoryId: 'test-id', contents: ['obs1'] }
      ]);
      expect(result).toEqual({
        message: 'Observations deleted successfully'
      });
    });
  });

  describe('handleRelationManage', () => {
    it('should handle create operation', async () => {
      const mockRelations = [
        { fromId: 'id1', toId: 'id2', relationType: 'test' }
      ];
      
      mockManager.createRelations.mockResolvedValue(mockRelations);

      const request = {
        operation: 'create' as const,
        relations: mockRelations
      };

      const result = await handlers.handleRelationManage(request);

      expect(mockManager.createRelations).toHaveBeenCalledWith(mockRelations);
      expect(result).toEqual(mockRelations);
    });

    it('should handle delete operation', async () => {
      mockManager.deleteRelations.mockResolvedValue(undefined);

      const request = {
        operation: 'delete' as const,
        relations: [
          { fromId: 'id1', toId: 'id2', relationType: 'test' }
        ]
      };

      const result = await handlers.handleRelationManage(request);

      expect(mockManager.deleteRelations).toHaveBeenCalledWith(request.relations);
      expect(result).toEqual({
        message: 'Relations deleted successfully'
      });
    });
  });

  describe('handleMemoryRetrieve', () => {
    it('should retrieve memories and strip embeddings', async () => {
      const mockGraph = {
        memories: [
          { id: 'test-id', name: 'Test', memoryType: 'test', nameEmbedding: [1, 2, 3], observations: [] }
        ],
        relations: []
      };
      
      mockManager.retrieveMemories.mockResolvedValue(mockGraph);

      const result = await handlers.handleMemoryRetrieve(['test-id']);

      expect(mockManager.retrieveMemories).toHaveBeenCalledWith(['test-id']);
      // Should strip nameEmbedding
      expect(result.memories[0]).toEqual({
        id: 'test-id',
        name: 'Test',
        memoryType: 'test',
        observations: []
      });
      expect(result.memories[0]).not.toHaveProperty('nameEmbedding');
    });
  });

  describe('handleMemorySearch', () => {
    it('should search memories with parameters', async () => {
      const mockResults = {
        memories: [
          { id: 'test-id', name: 'Test', memoryType: 'test', nameEmbedding: [1, 2, 3], observations: [] }
        ],
        _meta: { queryTime: 100 }
      };
      
      mockManager.searchMemories.mockResolvedValue(mockResults);

      const result = await handlers.handleMemorySearch('test query', 5, true, ['test'], 0.2);

      expect(mockManager.searchMemories).toHaveBeenCalledWith('test query', ['test'], 5, 0.2, true);
      // Should strip nameEmbedding
      expect(result.memories[0]).toEqual({
        id: 'test-id',
        name: 'Test',
        memoryType: 'test',
        observations: []
      });
      expect(result.memories[0]).not.toHaveProperty('nameEmbedding');
      expect(result._meta).toEqual({ queryTime: 100 });
    });
  });
});
