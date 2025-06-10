/**
 * Composite Memory Repository Enhanced Tests - Coverage Improvement
 * Focus: Edge cases, error scenarios, and comprehensive coverage paths
 * Target: Improve from 60.84% to 95%+ coverage
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

describe('CompositeMemoryRepository - Enhanced Coverage', () => {
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

  describe('Edge Cases - Empty Results Handling', () => {
    it('should handle findByType with no results', async () => {
      // Arrange
      mockCoreRepo.getMemoriesByType.mockResolvedValue([]);

      // Act
      const result = await repository.findByType('non-existent-type');

      // Assert
      expect(result).toEqual([]);
      expect(mockGraphRepo.getBatchContext).not.toHaveBeenCalled();
      expect(mockObsRepo.getBatchObservations).not.toHaveBeenCalled();
    });

    it('should handle findWithFilters with no results', async () => {
      // Arrange
      const filters = { memoryTypes: ['non-existent'], limit: 10 };
      mockCoreRepo.getFilteredMemories.mockResolvedValue([]);

      // Act
      const result = await repository.findWithFilters(filters);

      // Assert
      expect(result).toEqual([]);
      expect(mockGraphRepo.getBatchContext).not.toHaveBeenCalled();
      expect(mockObsRepo.getBatchObservations).not.toHaveBeenCalled();
    });

    it('should handle findByIds with no core memories found', async () => {
      // Arrange
      mockCoreRepo.getCoreMemoryData.mockResolvedValue([]);

      // Act
      const result = await repository.findByIds(['non-existent-1', 'non-existent-2']);

      // Assert
      expect(result).toEqual([]);
      expect(mockGraphRepo.getBatchContext).not.toHaveBeenCalled();
      expect(mockObsRepo.getBatchObservations).not.toHaveBeenCalled();
    });
  });

  describe('Data Composition Edge Cases', () => {
    it('should compose memory with missing graph context', async () => {
      // Arrange
      const coreMemory = {
        id: 'test-compose-1',
        name: 'Test Memory',
        memoryType: 'test',
        metadata: { status: 'active' },
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      // Missing graph context for this memory ID
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map());
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['test-compose-1', [{ id: 'obs-1', content: 'Test obs', createdAt: '2025-01-01T10:00:00Z' }]]
      ]));

      // Act
      const result = await repository.findById('test-compose-1');

      // Assert
      expect(result).toBeDefined();
      expect(result?.related?.ancestors).toEqual([]);
      expect(result?.related?.descendants).toEqual([]);
      expect(result?.observations).toHaveLength(1);
    });

    it('should compose memory with missing observations', async () => {
      // Arrange
      const coreMemory = {
        id: 'test-compose-2',
        name: 'Test Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['test-compose-2', { ancestors: [], descendants: [] }]
      ]));
      // Missing observations for this memory ID
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map());

      // Act
      const result = await repository.findById('test-compose-2');

      // Assert
      expect(result).toBeDefined();
      expect(result?.observations).toEqual([]);
      expect(result?.related?.ancestors).toEqual([]);
      expect(result?.related?.descendants).toEqual([]);
    });

    it('should compose memory with complex ancestor/descendant relations', async () => {
      // Arrange
      const coreMemory = {
        id: 'test-compose-3',
        name: 'Complex Memory',
        memoryType: 'complex',
        metadata: { level: 'advanced' },
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      const complexGraphContext = {
        ancestors: [
          { id: 'anc-1', name: 'First Ancestor', type: 'parent', relation: 'INFLUENCES', distance: 1 },
          { id: 'anc-2', name: 'Second Ancestor', type: 'grandparent', relation: 'CONTAINS', distance: 2 }
        ],
        descendants: [
          { id: 'desc-1', name: 'First Descendant', type: 'child', relation: 'DEPENDS_ON', distance: 1 },
          { id: 'desc-2', name: 'Second Descendant', type: 'grandchild', relation: 'EXTENDS', distance: 2 },
          { id: 'desc-3', name: 'Third Descendant', type: 'child', relation: 'USES', distance: 1 }
        ]
      };

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['test-compose-3', complexGraphContext]
      ]));
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['test-compose-3', []]
      ]));

      // Act
      const result = await repository.findById('test-compose-3');

      // Assert
      expect(result).toBeDefined();
      expect(result?.related?.ancestors).toHaveLength(2);
      expect(result?.related?.descendants).toHaveLength(3);
      expect(result?.related?.ancestors[0].distance).toBe(1);
      expect(result?.related?.descendants[1].distance).toBe(2);
    });
  });

  describe('Validation Edge Cases', () => {
    it('should handle mixed observation formats correctly', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-mixed-obs',
        name: 'Mixed Observations Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: [
          'Simple string observation',
          { content: 'Object observation with content', createdAt: '2025-01-01T10:00:00Z' },
          'Another string observation'
        ] as any
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);
      mockObsRepo.createObservations.mockResolvedValue(undefined);

      // Act
      await repository.create(memory);

      // Assert
      expect(mockObsRepo.createObservations).toHaveBeenCalledWith(
        mockSession,
        'test-mixed-obs',
        ['Simple string observation', 'Object observation with content', 'Another string observation']
      );
    });

    it('should throw error for completely invalid observation', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-invalid-obs',
        name: 'Invalid Observations Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: [
          'Valid string',
          123 as any,  // Invalid number
          'Another valid string'
        ] as any
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);

      // Act & Assert
      await expect(repository.create(memory)).rejects.toThrow('Invalid observation format: must be string or {content: string}');
      expect(mockObsRepo.createObservations).not.toHaveBeenCalled();
    });

    it('should throw error for observation object without content', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-no-content-obs',
        name: 'No Content Observations Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: [
          'Valid string',
          { title: 'Object without content', createdAt: '2025-01-01T10:00:00Z' } as any
        ] as any
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);

      // Act & Assert
      await expect(repository.create(memory)).rejects.toThrow('Invalid observation format: must be string or {content: string}');
    });

    it('should throw error for observation object with non-string content', async () => {
      // Arrange
      const memory: Memory = {
        id: 'test-non-string-content',
        name: 'Non-String Content Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: [
          { content: 123 } as any  // content is not a string
        ] as any
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);

      // Act & Assert
      await expect(repository.create(memory)).rejects.toThrow('Invalid observation format: must be string or {content: string}');
    });
  });

  describe('Repository Error Propagation', () => {
    it('should propagate core repository errors during creation', async () => {
      // Arrange
      const memory: Memory = {
        id: 'error-test',
        name: 'Error Test Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date()
      };

      const coreError = new Error('Core repository creation failed');
      mockCoreRepo.createMemoryNode.mockRejectedValue(coreError);

      // Act & Assert
      await expect(repository.create(memory)).rejects.toThrow('Core repository creation failed');
    });

    it('should propagate observation repository errors during creation', async () => {
      // Arrange
      const memory: Memory = {
        id: 'obs-error-test',
        name: 'Observation Error Test',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date(),
        observations: ['Test observation']
      };

      mockCoreRepo.createMemoryNode.mockResolvedValue(memory);
      const obsError = new Error('Observation creation failed');
      mockObsRepo.createObservations.mockRejectedValue(obsError);

      // Act & Assert
      await expect(repository.create(memory)).rejects.toThrow('Observation creation failed');
    });

    it('should propagate core repository errors during findByIds', async () => {
      // Arrange
      const coreError = new Error('Core repository find failed');
      mockCoreRepo.getCoreMemoryData.mockRejectedValue(coreError);

      // Act & Assert
      await expect(repository.findByIds(['test-1', 'test-2'])).rejects.toThrow('Core repository find failed');
    });

    it('should propagate graph repository errors during findByIds', async () => {
      // Arrange
      const coreMemory = {
        id: 'graph-error-test',
        name: 'Graph Error Test',
        memoryType: 'test',
        metadata: {},
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      const graphError = new Error('Graph context retrieval failed');
      mockGraphRepo.getBatchContext.mockRejectedValue(graphError);

      // Act & Assert
      await expect(repository.findByIds(['graph-error-test'])).rejects.toThrow('Graph context retrieval failed');
    });

    it('should propagate observation repository errors during findByIds', async () => {
      // Arrange
      const coreMemory = {
        id: 'obs-error-find-test',
        name: 'Observation Error Find Test',
        memoryType: 'test',
        metadata: {},
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map());
      const obsError = new Error('Observation retrieval failed');
      mockObsRepo.getBatchObservations.mockRejectedValue(obsError);

      // Act & Assert
      await expect(repository.findByIds(['obs-error-find-test'])).rejects.toThrow('Observation retrieval failed');
    });
  });

  describe('Session Factory Error Handling', () => {
    it('should propagate session factory errors', async () => {
      // Arrange
      const sessionError = new Error('Session creation failed');
      mockSessionFactory.withSession.mockRejectedValue(sessionError);

      const memory: Memory = {
        id: 'session-error-test',
        name: 'Session Error Test',
        memoryType: 'test',
        metadata: {},
        createdAt: new Date(),
        modifiedAt: new Date(),
        lastAccessed: new Date()
      };

      // Act & Assert
      await expect(repository.create(memory)).rejects.toThrow('Session creation failed');
      await expect(repository.findById('test-id')).rejects.toThrow('Session creation failed');
      await expect(repository.update(memory)).rejects.toThrow('Session creation failed');
      await expect(repository.delete('test-id')).rejects.toThrow('Session creation failed');
      await expect(repository.exists('test-id')).rejects.toThrow('Session creation failed');
      await expect(repository.findByType('test-type')).rejects.toThrow('Session creation failed');
      await expect(repository.findWithFilters({})).rejects.toThrow('Session creation failed');
      await expect(repository.addObservations('test-id', ['obs'])).rejects.toThrow('Session creation failed');
      await expect(repository.deleteObservations('test-id', ['obs-id'])).rejects.toThrow('Session creation failed');
      await expect(repository.createRelation('from', 'to', 'type')).rejects.toThrow('Session creation failed');
      await expect(repository.deleteRelation('from', 'to', 'type')).rejects.toThrow('Session creation failed');
    });
  });

  describe('Parallel Operations Testing', () => {
    it('should handle parallel Promise.all correctly in findByType', async () => {
      // Arrange
      const coreMemories = [
        {
          id: 'parallel-1',
          name: 'Parallel Memory 1',
          memoryType: 'parallel',
          metadata: {},
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z'
        },
        {
          id: 'parallel-2',
          name: 'Parallel Memory 2',
          memoryType: 'parallel',
          metadata: {},
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z'
        }
      ];

      mockCoreRepo.getMemoriesByType.mockResolvedValue(coreMemories);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['parallel-1', { ancestors: [], descendants: [] }],
        ['parallel-2', { ancestors: [], descendants: [] }]
      ]));
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['parallel-1', []],
        ['parallel-2', []]
      ]));

      // Act
      const result = await repository.findByType('parallel');

      // Assert
      expect(result).toHaveLength(2);
      expect(mockGraphRepo.getBatchContext).toHaveBeenCalledWith(mockSession, ['parallel-1', 'parallel-2']);
      expect(mockObsRepo.getBatchObservations).toHaveBeenCalledWith(mockSession, ['parallel-1', 'parallel-2']);
    });

    it('should handle parallel Promise.all correctly in findWithFilters', async () => {
      // Arrange
      const filters = { memoryTypes: ['filtered'], limit: 5 };
      const coreMemories = [
        {
          id: 'filtered-1',
          name: 'Filtered Memory',
          memoryType: 'filtered',
          metadata: {},
          createdAt: '2025-01-01T09:00:00Z',
          modifiedAt: '2025-01-01T09:30:00Z',
          lastAccessed: '2025-01-01T10:00:00Z'
        }
      ];

      mockCoreRepo.getFilteredMemories.mockResolvedValue(coreMemories);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['filtered-1', { ancestors: [], descendants: [] }]
      ]));
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['filtered-1', []]
      ]));

      // Act
      const result = await repository.findWithFilters(filters);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockCoreRepo.getFilteredMemories).toHaveBeenCalledWith(mockSession, filters);
      expect(mockGraphRepo.getBatchContext).toHaveBeenCalledWith(mockSession, ['filtered-1']);
      expect(mockObsRepo.getBatchObservations).toHaveBeenCalledWith(mockSession, ['filtered-1']);
    });
  });

  describe('Memory Composition with Various Data Types', () => {
    it('should compose memory with Date objects for timestamps', async () => {
      // Arrange
      const coreMemory = {
        id: 'date-test',
        name: 'Date Test Memory',
        memoryType: 'temporal',
        metadata: { timezone: 'UTC' },
        createdAt: '2025-01-01T09:00:00.000Z',
        modifiedAt: '2025-01-01T09:30:00.000Z',
        lastAccessed: '2025-01-01T10:00:00.000Z'
      };

      const observations = [
        {
          id: 'obs-date-1',
          content: 'Timestamped observation',
          createdAt: '2025-01-01T10:15:00.000Z'
        }
      ];

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['date-test', { ancestors: [], descendants: [] }]
      ]));
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['date-test', observations]
      ]));

      // Act
      const result = await repository.findById('date-test');

      // Assert
      expect(result).toBeDefined();
      expect(result?.createdAt).toBe('2025-01-01T09:00:00.000Z');
      expect(result?.observations[0].createdAt).toBe('2025-01-01T10:15:00.000Z');
    });

    it('should compose memory with complex metadata structures', async () => {
      // Arrange
      const complexMetadata = {
        project: {
          name: 'Advanced Project',
          version: '2.1.0',
          dependencies: ['react', 'typescript', 'neo4j']
        },
        tags: ['important', 'architecture', 'core'],
        performance: {
          cpu: 85.3,
          memory: 1024,
          responseTime: '120ms'
        }
      };

      const coreMemory = {
        id: 'complex-metadata-test',
        name: 'Complex Metadata Memory',
        memoryType: 'system',
        metadata: complexMetadata,
        createdAt: '2025-01-01T09:00:00Z',
        modifiedAt: '2025-01-01T09:30:00Z',
        lastAccessed: '2025-01-01T10:00:00Z'
      };

      mockCoreRepo.getCoreMemoryData.mockResolvedValue([coreMemory]);
      mockGraphRepo.getBatchContext.mockResolvedValue(new Map([
        ['complex-metadata-test', { ancestors: [], descendants: [] }]
      ]));
      mockObsRepo.getBatchObservations.mockResolvedValue(new Map([
        ['complex-metadata-test', []]
      ]));

      // Act
      const result = await repository.findById('complex-metadata-test');

      // Assert
      expect(result).toBeDefined();
      expect(result?.metadata).toEqual(complexMetadata);
      expect(result?.metadata.project.name).toBe('Advanced Project');
      expect(result?.metadata.tags).toHaveLength(3);
    });
  });
});
