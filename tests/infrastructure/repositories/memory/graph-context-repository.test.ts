/**
 * Graph Context Repository Tests - Comprehensive Coverage
 * Target: Improve coverage from 60.84% to 95%+
 * Focus: Graph traversal logic, batch operations, data processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphContextRepository, GraphContext, RelatedMemoryData } from '../../../../src/infrastructure/repositories/memory/graph-context-repository';
import { Session } from 'neo4j-driver';

describe('GraphContextRepository - Comprehensive Coverage', () => {
  let repository: GraphContextRepository;
  let mockSession: any;

  beforeEach(() => {
    repository = new GraphContextRepository();
    
    // Mock Neo4j session
    mockSession = {
      run: vi.fn(),
      close: vi.fn()
    };
  });

  describe('getMemoryContext - Single Memory', () => {
    it('should return context for memory with ancestors and descendants', async () => {
      // Arrange
      const memoryId = 'test-memory-123';
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'ancestor-1',
              name: 'Parent Memory',
              type: 'parent',
              relation: 'INFLUENCES',
              distance: 1,
              strength: 0.8,
              source: 'agent',
              createdAt: '2025-01-01T10:00:00Z'
            }
          ])
          .mockReturnValueOnce([
            {
              id: 'descendant-1',
              name: 'Child Memory',
              type: 'child',
              relation: 'DEPENDS_ON',
              distance: 1,
              strength: 0.9,
              source: 'user',
              createdAt: '2025-01-01T11:00:00Z'
            }
          ])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, memoryId);

      // Assert
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Memory {id: $memoryId})'),
        { memoryId }
      );
      expect(result.ancestors).toHaveLength(1);
      expect(result.descendants).toHaveLength(1);
      expect(result.ancestors[0].id).toBe('ancestor-1');
      expect(result.descendants[0].id).toBe('descendant-1');
    });

    it('should return empty context when memory not found', async () => {
      // Arrange
      mockSession.run.mockResolvedValue({
        records: []
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'non-existent-id');

      // Assert
      expect(result).toEqual({
        ancestors: [],
        descendants: []
      });
    });

    it('should handle memory with null ancestors and descendants', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce(null)  // ancestors
          .mockReturnValueOnce(null)  // descendants
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'isolated-memory');

      // Assert
      expect(result).toEqual({
        ancestors: [],
        descendants: []
      });
    });

    it('should handle memory with undefined graph data', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce(undefined)  // ancestors
          .mockReturnValueOnce(undefined)  // descendants
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'undefined-context');

      // Assert
      expect(result).toEqual({
        ancestors: [],
        descendants: []
      });
    });

    it('should process complex multi-level relationships', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'ancestor-level-1',
              name: 'Direct Parent',
              type: 'parent',
              relation: 'INFLUENCES',
              distance: 1,
              strength: 0.9
            },
            {
              id: 'ancestor-level-2',
              name: 'Grandparent',
              type: 'grandparent',
              relation: 'CONTAINS',
              distance: 2,
              strength: 0.7
            }
          ])
          .mockReturnValueOnce([
            {
              id: 'descendant-level-1',
              name: 'Direct Child',
              type: 'child',
              relation: 'DEPENDS_ON',
              distance: 1,
              strength: 0.8
            },
            {
              id: 'descendant-level-2',
              name: 'Grandchild',
              type: 'grandchild',
              relation: 'EXTENDS',
              distance: 2,
              strength: 0.6
            }
          ])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'multi-level-memory');

      // Assert
      expect(result.ancestors).toHaveLength(2);
      expect(result.descendants).toHaveLength(2);
      
      // Check specific distances
      expect(result.ancestors[0].distance).toBe(1);
      expect(result.ancestors[1].distance).toBe(2);
      expect(result.descendants[0].distance).toBe(1);
      expect(result.descendants[1].distance).toBe(2);
    });
  });

  describe('getBatchContext - Multiple Memories', () => {
    it('should return empty map for empty memory IDs array', async () => {
      // Act
      const result = await repository.getBatchContext(mockSession, []);

      // Assert
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockSession.run).not.toHaveBeenCalled();
    });

    it('should get context for multiple memories', async () => {
      // Arrange
      const memoryIds = ['memory-1', 'memory-2'];
      const mockRecords = [
        {
          get: vi.fn()
            .mockReturnValueOnce('memory-1')  // memoryId
            .mockReturnValueOnce([           // ancestors
              {
                id: 'ancestor-1-1',
                name: 'Memory 1 Parent',
                type: 'parent',
                relation: 'INFLUENCES',
                distance: 1
              }
            ])
            .mockReturnValueOnce([           // descendants
              {
                id: 'descendant-1-1',
                name: 'Memory 1 Child',
                type: 'child',
                relation: 'DEPENDS_ON',
                distance: 1
              }
            ])
        },
        {
          get: vi.fn()
            .mockReturnValueOnce('memory-2')  // memoryId
            .mockReturnValueOnce([])          // ancestors - empty
            .mockReturnValueOnce([           // descendants
              {
                id: 'descendant-2-1',
                name: 'Memory 2 Child',
                type: 'child',
                relation: 'EXTENDS',
                distance: 1
              }
            ])
        }
      ];

      mockSession.run.mockResolvedValue({
        records: mockRecords
      });

      // Act
      const result = await repository.getBatchContext(mockSession, memoryIds);

      // Assert
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.id IN $memoryIds'),
        { memoryIds }
      );
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('memory-1')?.ancestors).toHaveLength(1);
      expect(result.get('memory-1')?.descendants).toHaveLength(1);
      expect(result.get('memory-2')?.ancestors).toHaveLength(0);
      expect(result.get('memory-2')?.descendants).toHaveLength(1);
    });

    it('should handle batch with no results', async () => {
      // Arrange
      mockSession.run.mockResolvedValue({
        records: []
      });

      // Act
      const result = await repository.getBatchContext(mockSession, ['non-existent-1', 'non-existent-2']);

      // Assert
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should handle batch with partial results', async () => {
      // Arrange
      const memoryIds = ['exists-1', 'non-existent', 'exists-2'];
      const mockRecords = [
        {
          get: vi.fn()
            .mockReturnValueOnce('exists-1')
            .mockReturnValueOnce([])
            .mockReturnValueOnce([])
        }
        // Note: 'non-existent' has no record, 'exists-2' is missing too
      ];

      mockSession.run.mockResolvedValue({
        records: mockRecords
      });

      // Act
      const result = await repository.getBatchContext(mockSession, memoryIds);

      // Assert
      expect(result.size).toBe(1);
      expect(result.has('exists-1')).toBe(true);
      expect(result.has('non-existent')).toBe(false);
      expect(result.has('exists-2')).toBe(false);
    });

    it('should handle large batch of memory IDs', async () => {
      // Arrange
      const memoryIds = Array.from({ length: 50 }, (_, i) => `memory-${i}`);
      const mockRecords = memoryIds.map((id, index) => ({
        get: vi.fn()
          .mockReturnValueOnce(id)
          .mockReturnValueOnce([])  // ancestors
          .mockReturnValueOnce([])  // descendants
      }));

      mockSession.run.mockResolvedValue({
        records: mockRecords
      });

      // Act
      const result = await repository.getBatchContext(mockSession, memoryIds);

      // Assert
      expect(result.size).toBe(50);
      expect(mockSession.run).toHaveBeenCalledOnce();
    });
  });

  describe('Data Processing - Neo4j Integer Conversion', () => {
    it('should convert Neo4j integer objects to numbers', async () => {
      // Arrange
      const mockNeo4jInteger = {
        toNumber: vi.fn().mockReturnValue(3)
      };

      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'test-ancestor',
              name: 'Test Ancestor',
              type: 'test',
              relation: 'INFLUENCES',
              distance: mockNeo4jInteger,  // Neo4j Integer object
              strength: 0.8
            }
          ])
          .mockReturnValueOnce([])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'test-id');

      // Assert
      expect(result.ancestors[0].distance).toBe(3);
      expect(mockNeo4jInteger.toNumber).toHaveBeenCalled();
    });

    it('should handle numeric distance values directly', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'test-ancestor',
              name: 'Test Ancestor',
              type: 'test',
              relation: 'INFLUENCES',
              distance: 2,  // Already a number
              strength: 0.8
            }
          ])
          .mockReturnValueOnce([])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'test-id');

      // Assert
      expect(result.ancestors[0].distance).toBe(2);
    });

    it('should handle null/undefined distance values', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'test-ancestor-1',
              name: 'Test Ancestor 1',
              type: 'test',
              relation: 'INFLUENCES',
              distance: null,
              strength: 0.8
            },
            {
              id: 'test-ancestor-2',
              name: 'Test Ancestor 2',
              type: 'test',
              relation: 'DEPENDS_ON',
              distance: undefined,
              strength: 0.7
            }
          ])
          .mockReturnValueOnce([])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'test-id');

      // Assert
      expect(result.ancestors[0].distance).toBe(0);
      expect(result.ancestors[1].distance).toBe(0);
    });

    it('should filter out null ID entries', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'valid-ancestor',
              name: 'Valid Ancestor',
              type: 'test',
              relation: 'INFLUENCES',
              distance: 1
            },
            {
              id: null,  // Should be filtered out
              name: 'Invalid Ancestor',
              type: 'test',
              relation: 'INFLUENCES',
              distance: 1
            },
            {
              id: 'another-valid',
              name: 'Another Valid',
              type: 'test',
              relation: 'DEPENDS_ON',
              distance: 2
            }
          ])
          .mockReturnValueOnce([])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'test-id');

      // Assert
      expect(result.ancestors).toHaveLength(2);
      expect(result.ancestors[0].id).toBe('valid-ancestor');
      expect(result.ancestors[1].id).toBe('another-valid');
    });

    it('should handle empty related data arrays', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([])  // empty ancestors
          .mockReturnValueOnce([])  // empty descendants
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'isolated-memory');

      // Assert
      expect(result.ancestors).toHaveLength(0);
      expect(result.descendants).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should propagate session run errors', async () => {
      // Arrange
      const sessionError = new Error('Neo4j connection failed');
      mockSession.run.mockRejectedValue(sessionError);

      // Act & Assert
      await expect(repository.getMemoryContext(mockSession, 'test-id'))
        .rejects.toThrow('Neo4j connection failed');
    });

    it('should propagate batch session errors', async () => {
      // Arrange
      const sessionError = new Error('Batch query failed');
      mockSession.run.mockRejectedValue(sessionError);

      // Act & Assert
      await expect(repository.getBatchContext(mockSession, ['test-1', 'test-2']))
        .rejects.toThrow('Batch query failed');
    });

    it('should handle malformed record data gracefully', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              // Missing required fields
              id: 'incomplete-data',
              // name: missing
              // type: missing
              // relation: missing
              distance: 1
            }
          ])
          .mockReturnValueOnce([])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'test-id');

      // Assert
      expect(result.ancestors).toHaveLength(1);
      expect(result.ancestors[0].id).toBe('incomplete-data');
      expect(result.ancestors[0].distance).toBe(1);
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle single memory with maximum relationships (3 ancestors + 3 descendants)', async () => {
      // Arrange
      const ancestors = Array.from({ length: 3 }, (_, i) => ({
        id: `ancestor-${i}`,
        name: `Ancestor ${i}`,
        type: 'parent',
        relation: 'INFLUENCES',
        distance: i + 1,
        strength: 0.8 - (i * 0.1)
      }));

      const descendants = Array.from({ length: 3 }, (_, i) => ({
        id: `descendant-${i}`,
        name: `Descendant ${i}`,
        type: 'child',
        relation: 'DEPENDS_ON',
        distance: i + 1,
        strength: 0.9 - (i * 0.1)
      }));

      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce(ancestors)
          .mockReturnValueOnce(descendants)
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'popular-memory');

      // Assert
      expect(result.ancestors).toHaveLength(3);
      expect(result.descendants).toHaveLength(3);
    });

    it('should handle various relationship types and strengths', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'rel-influences',
              name: 'Influences Memory',
              type: 'architecture',
              relation: 'INFLUENCES',
              distance: 1,
              strength: 0.95,
              source: 'agent',
              createdAt: '2025-01-01T10:00:00Z'
            },
            {
              id: 'rel-contains',
              name: 'Contains Memory',
              type: 'project',
              relation: 'CONTAINS',
              distance: 1,
              strength: 0.85,
              source: 'user',
              createdAt: '2025-01-01T09:00:00Z'
            }
          ])
          .mockReturnValueOnce([
            {
              id: 'rel-depends',
              name: 'Depends Memory',
              type: 'implementation',
              relation: 'DEPENDS_ON',
              distance: 1,
              strength: 0.75,
              source: 'system',
              createdAt: '2025-01-01T11:00:00Z'
            }
          ])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'diverse-relations');

      // Assert
      expect(result.ancestors).toHaveLength(2);
      expect(result.descendants).toHaveLength(1);
      
      // Check relationship diversity
      const relationTypes = result.ancestors.map(a => a.relation);
      expect(relationTypes).toContain('INFLUENCES');
      expect(relationTypes).toContain('CONTAINS');
      expect(result.descendants[0].relation).toBe('DEPENDS_ON');
    });

    it('should preserve all relationship metadata', async () => {
      // Arrange
      const mockRecord = {
        get: vi.fn()
          .mockReturnValueOnce([
            {
              id: 'metadata-test',
              name: 'Metadata Test Memory',
              type: 'test-type',
              relation: 'TEST_RELATION',
              distance: 2,
              strength: 0.7534,  // Precise decimal
              source: 'automated-agent',
              createdAt: '2025-01-01T15:30:45.123Z'
            }
          ])
          .mockReturnValueOnce([])
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      // Act
      const result = await repository.getMemoryContext(mockSession, 'metadata-check');

      // Assert
      const ancestor = result.ancestors[0];
      expect(ancestor.id).toBe('metadata-test');
      expect(ancestor.name).toBe('Metadata Test Memory');
      expect(ancestor.type).toBe('test-type');
      expect(ancestor.relation).toBe('TEST_RELATION');
      expect(ancestor.distance).toBe(2);
      expect(ancestor.strength).toBe(0.7534);
      expect(ancestor.source).toBe('automated-agent');
      expect(ancestor.createdAt).toBe('2025-01-01T15:30:45.123Z');
    });
  });
});
