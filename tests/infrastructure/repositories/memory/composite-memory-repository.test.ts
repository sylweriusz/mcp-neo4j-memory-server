/**
 * Composite Memory Repository Tests - Production Coverage
 * Single responsibility: Test repository orchestration with specialized components
 * 
 * THE IMPLEMENTOR'S RULE: Test production paths with minimal mocking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompositeMemoryRepository } from '../../../../src/infrastructure/repositories/memory/composite-memory-repository';
import { Memory } from '../../../../src/domain/entities/memory';
import { SessionFactory } from '../../../../src/infrastructure/database/session-factory';
import { CoreMemoryRepository } from '../../../../src/infrastructure/repositories/memory/core-memory-repository';
import { GraphContextRepository } from '../../../../src/infrastructure/repositories/memory/graph-context-repository';
import { ObservationRepository } from '../../../../src/infrastructure/repositories/memory/observation-repository';
import { RelationRepository } from '../../../../src/infrastructure/repositories/memory/relation-repository';

// Mock the specialized repositories
vi.mock('../../../../src/infrastructure/repositories/memory/core-memory-repository');
vi.mock('../../../../src/infrastructure/repositories/memory/graph-context-repository');
vi.mock('../../../../src/infrastructure/repositories/memory/observation-repository');
vi.mock('../../../../src/infrastructure/repositories/memory/relation-repository');

describe('CompositeMemoryRepository - Production Coverage', () => {
  let repository: CompositeMemoryRepository;
  let mockSessionFactory: any;
  let mockSession: any;
  let mockCoreRepo: any;
  let mockGraphRepo: any;
  let mockObsRepo: any;
  let mockRelRepo: any;

  beforeEach(() => {
    // Mock session
    mockSession = {
      close: vi.fn().mockResolvedValue(undefined)
    };

    // Mock session factory
    mockSessionFactory = {
      withSession: vi.fn().mockImplementation(async (callback) => {
        return await callback(mockSession);
      }),
      createSession: vi.fn().mockReturnValue(mockSession)
    };

    // Mock specialized repositories
    mockCoreRepo = {
      createMemoryNode: vi.fn(),
      getCoreMemoryData: vi.fn(),
      getMemoriesByType: vi.fn(),
      updateMemory: vi.fn(),
      deleteMemory: vi.fn(),
      memoryExists: vi.fn(),
      getFilteredMemories: vi.fn()
    };

    mockGraphRepo = {
      getBatchContext: vi.fn(),
      getMemoryContext: vi.fn()
    };

    mockObsRepo = {
      createObservations: vi.fn(),
      deleteObservations: vi.fn(),
      getBatchObservations: vi.fn()
    };

    mockRelRepo = {
      createRelation: vi.fn(),
      createEnhancedRelation: vi.fn(),
      deleteRelation: vi.fn()
    };

    // Set up constructor mocks
    (CoreMemoryRepository as any).mockImplementation(() => mockCoreRepo);
    (GraphContextRepository as any).mockImplementation(() => mockGraphRepo);
    (ObservationRepository as any).mockImplementation(() => mockObsRepo);
    (RelationRepository as any).mockImplementation(() => mockRelRepo);

    repository = new CompositeMemoryRepository(mockSessionFactory);
  });

  describe('Memory Creation', () => {
    it('should create memory without observations', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-123',
        name: 'Test Memory',
        memoryType: 'project',
        metadata: { status: 'active' },
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date()
      };

      const createdMemory = { ...memory };
      mockCoreRepo.createMemoryNode.mockResolvedValue(createdMemory);

      // Act
      const result = await repository.create(memory);

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockCoreRepo.createMemoryNode).toHaveBeenCalledWith(mockSession, memory);
      expect(mockObsRepo.createObservations).not.toHaveBeenCalled();
      expect(result).toEqual(createdMemory);
    });

    it('should create memory with observations', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-456',
        name: 'Memory with Observations',
        memoryType: 'knowledge',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: [
          { content: 'First observation', createdAt: '2025-01-01T10:00:00Z' },
          { content: 'Second observation', createdAt: '2025-01-01T11:00:00Z' }
        ]
      };

      const createdMemory = { ...memory };
      mockCoreRepo.createMemoryNode.mockResolvedValue(createdMemory);
      mockObsRepo.createObservations.mockResolvedValue(undefined);

      // Act
      const result = await repository.create(memory);

      // Assert
      expect(mockCoreRepo.createMemoryNode).toHaveBeenCalledWith(mockSession, memory);
      expect(mockObsRepo.createObservations).toHaveBeenCalledWith(
        mockSession,
        'test-456',
        ['First observation', 'Second observation']
      );
      expect(result).toEqual(createdMemory);
    });

    it('should handle string observations', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-789',
        name: 'Memory with String Observations',
        memoryType: 'reference',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: ['Simple string observation'] as any
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);

      // Act
      await repository.create(memory);

      // Assert
      expect(mockObsRepo.createObservations).toHaveBeenCalledWith(
        mockSession,
        'test-789',
        ['Simple string observation']
      );
    });

    it('should handle empty observations array', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-empty',
        name: 'Memory with Empty Observations',
        memoryType: 'task',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: []
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);

      // Act
      await repository.create(memory);

      // Assert
      expect(mockObsRepo.createObservations).not.toHaveBeenCalled();
    });
  });

  describe('Memory Retrieval', () => {
    it('should find memory by single ID', async () => {
      // Arrange
      const coreMemory = {
        id: 'single-123',
        name: 'Single Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['single-123', { ancestors: [], descendants: [] }]
      ]));
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['single-123', []]
      ]));

      // Act
      const result = await repository.findById('single-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe('single-123');
      expect(result?.name).toBe('Single Memory');
    });

    it('should return null for non-existent memory', async () => {
      // Arrange
      mockCoreRepo.getCoreMemoryData.mockResolvedValue([]);

      // Act
      const result = await repository.findById('non-existent');

      // Assert
      expect(result).toBeNull();
    });

    it('should find multiple memories by IDs', async () => {
      // Arrange
      const coreMemories = [
        {
          id: 'multi-1',
          name: 'First Memory',
          memoryType: 'test',
          metadata: {},
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z'
        },
        {
          id: 'multi-2',
          name: 'Second Memory',
          memoryType: 'test',
          metadata: {},
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z'
        }
      ];

      mockCoreRepo.getCoreMemoryData.mockResolvedValue(coreMemories);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map());
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map());

      // Act
      const result = await repository.findByIds(['multi-1', 'multi-2']);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('multi-1');
      expect(result[1].id).toBe('multi-2');
    });

    it('should handle empty IDs array', async () => {
      // Act
      const result = await repository.findByIds([]);

      // Assert
      expect(result).toEqual([]);
      expect(mockCoreRepo.getCoreMemoryData).not.toHaveBeenCalled();
    });

    it('should handle null IDs parameter', async () => {
      // Act
      const result = await repository.findByIds(null as any);

      // Assert
      expect(result).toEqual([]);
      expect(mockCoreRepo.getCoreMemoryData).not.toHaveBeenCalled();
    });
  });

  describe('Memory Update and Delete', () => {
    it('should update memory successfully', async () => {
      // Arrange
      const memory: Memory = {
        id: 'update-123',
        name: 'Updated Memory',
        memoryType: 'updated',
        metadata: { status: 'modified' },
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date()
      };

      mockCoreRepo.updateMemory.mockResolvedValue(memory);

      // Act
      const result = await repository.update(memory);

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockCoreRepo.updateMemory).toHaveBeenCalledWith(mockSession, memory);
      expect(result).toEqual(memory);
    });

    it('should delete memory successfully', async () => {
      // Arrange
      mockCoreRepo.deleteMemory.mockResolvedValue(true);

      // Act
      const result = await repository.delete('delete-123');

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockCoreRepo.deleteMemory).toHaveBeenCalledWith(mockSession, 'delete-123');
      expect(result).toBe(true);
    });

    it('should check memory existence', async () => {
      // Arrange
      mockCoreRepo.memoryExists.mockResolvedValue(true);

      // Act
      const result = await repository.exists('exists-123');

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockCoreRepo.memoryExists).toHaveBeenCalledWith(mockSession, 'exists-123');
      expect(result).toBe(true);
    });
  });

  describe('Memory Filtering', () => {
    it('should find memories by type', async () => {
      // Arrange
      const coreMemories = [
        {
          id: 'type-1',
          name: 'Project Memory',
          memoryType: 'project',
          metadata: {},
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z'
        }
      ];

      mockCoreRepo.getMemoriesByType.mockResolvedValue(coreMemories);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map());
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map());

      // Act
      const result = await repository.findByType('project');

      // Assert
      expect(mockCoreRepo.getMemoriesByType).toHaveBeenCalledWith(mockSession, 'project');
      expect(result).toHaveLength(1);
      expect(result[0].memoryType).toBe('project');
    });

    it('should find memories with filters', async () => {
      // Arrange
      const filters = {
        memoryTypes: ['project', 'task'],
        limit: 50,
        offset: 10
      };

      const coreMemories = [
        {
          id: 'filtered-1',
          name: 'Filtered Memory',
          memoryType: 'project',
          metadata: {},
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z'
        }
      ];

      mockCoreRepo.getFilteredMemories.mockResolvedValue(coreMemories);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map());
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map());

      // Act
      const result = await repository.findWithFilters(filters);

      // Assert
      expect(mockCoreRepo.getFilteredMemories).toHaveBeenCalledWith(mockSession, filters);
      expect(result).toHaveLength(1);
    });
  });

  describe('Observation Management', () => {
    it('should add observations to memory', async () => {
      // Arrange
      const memoryId = 'obs-123';
      const observations = ['New observation 1', 'New observation 2'];

      mockObsRepo.createObservations.mockResolvedValue(undefined);

      // Act
      await repository.addObservations(memoryId, observations);

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockObsRepo.createObservations).toHaveBeenCalledWith(
        mockSession,
        memoryId,
        observations
      );
    });

    it('should delete observations from memory', async () => {
      // Arrange
      const memoryId = 'obs-delete-123';
      const observationIds = ['obs-id-1', 'obs-id-2'];

      mockObsRepo.deleteObservations.mockResolvedValue(undefined);

      // Act
      await repository.deleteObservations(memoryId, observationIds);

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockObsRepo.deleteObservations).toHaveBeenCalledWith(
        mockSession,
        memoryId,
        observationIds
      );
    });
  });

  describe('Relation Management', () => {
    it('should create simple relation', async () => {
      // Arrange
      const fromId = 'rel-from-123';
      const toId = 'rel-to-456';
      const relationType = 'INFLUENCES';

      mockRelRepo.createRelation.mockResolvedValue(undefined);

      // Act
      await repository.createRelation(fromId, toId, relationType);

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockRelRepo.createRelation).toHaveBeenCalledWith(
        mockSession,
        fromId,
        toId,
        relationType
      );
    });

    it('should create enhanced relation', async () => {
      // Arrange
      const request = {
        fromId: 'enhanced-from-123',
        toId: 'enhanced-to-456',
        relationType: 'DEPENDS_ON',
        strength: 0.8,
        source: 'agent',
        createdAt: '2025-01-01T10:00:00Z'
      };

      mockRelRepo.createEnhancedRelation.mockResolvedValue(undefined);

      // Act
      await repository.createEnhancedRelation(request);

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockRelRepo.createEnhancedRelation).toHaveBeenCalledWith(
        mockSession,
        request
      );
    });

    it('should delete relation', async () => {
      // Arrange
      const fromId = 'del-from-123';
      const toId = 'del-to-456';
      const relationType = 'RELATES_TO';

      mockRelRepo.deleteRelation.mockResolvedValue(undefined);

      // Act
      await repository.deleteRelation(fromId, toId, relationType);

      // Assert
      expect(mockSessionFactory.withSession).toHaveBeenCalledOnce();
      expect(mockRelRepo.deleteRelation).toHaveBeenCalledWith(
        mockSession,
        fromId,
        toId,
        relationType
      );
    });
  });

  describe('Data Composition', () => {
    it('should compose memory with full context', async () => {
      // Arrange
      const coreMemory = {
        id: 'compose-123',
        name: 'Composed Memory',
        memoryType: 'complex',
        metadata: { tags: ['important'] },
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      const graphContext = {
        ancestors: [
          { id: 'ancestor-1', name: 'Parent', type: 'parent', relation: 'INFLUENCES', distance: 1 }
        ],
        descendants: [
          { id: 'descendant-1', name: 'Child', type: 'child', relation: 'DEPENDS_ON', distance: 1 }
        ]
      };

      const observations = [
        { id: 'obs-1', content: 'First observation', createdAt: '2025-01-01T10:00:00Z' },
        { id: 'obs-2', content: 'Second observation', createdAt: '2025-01-01T11:00:00Z' }
      ];

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['compose-123', graphContext]
      ]));
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['compose-123', observations]
      ]));

      // Act
      const result = await repository.findById('compose-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe('compose-123');
      expect(result?.observations).toHaveLength(2);
      expect(result?.related?.ancestors).toHaveLength(1);
      expect(result?.related?.descendants).toHaveLength(1);
    });

    it('should handle invalid observation formats', async () => {
      // Arrange
      const memory: Memory = {
        id: 'invalid-obs',
        name: 'Memory with Invalid Observations',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: [
          { content: 'Valid observation' },
          'Valid string observation',
          { invalid: 'Invalid object' } as any,
          null as any
        ] as any
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);

      // Act & Assert
      await expect(repository.create(memory)).rejects.toThrow('Invalid observation format');
    });
  });
});
