/**
 * Core Memory Repository - Production Batch Operations Testing
 * THE IMPLEMENTOR'S RULE: Test the data layer that everything depends on
 * 
 * Target: 45.08% -> 75%+ coverage
 * Focus: Lines 108-245, 252-253 (batch operations, edge cases)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Session } from 'neo4j-driver';
import { CoreMemoryRepository } from '../../../../src/infrastructure/repositories/memory/core-memory-repository';
import { Memory } from '../../../../src/domain/entities/memory';
import { generateCompactId } from '../../../../src/id_generator';

// Create a controlled mock session
const createMockSession = () => ({
  run: vitest.fn(),
  close: vitest.fn()
});

describe('Core Memory Repository - Batch Operations & Edge Cases', () => {
  let repository: CoreMemoryRepository;
  let mockSession: any;
  let testMemory: Memory;

  beforeEach(() => {
    repository = new CoreMemoryRepository();
    mockSession = createMockSession();
    
    testMemory = {
      id: generateCompactId(),
      name: 'Test Memory',
      memoryType: 'note',
      metadata: { tags: ['test'], priority: 'high' },
      createdAt: new Date(),
      modifiedAt: new Date(),
      lastAccessed: new Date()
    };
  });

  describe('Batch Memory Retrieval - getFilteredMemories', () => {
    it('should handle complex filtering with pagination', async () => {
      const mockRecords = [
        {
          get: (field: string) => {
            switch (field) {
              case 'id': return 'mem1';
              case 'name': return 'Project Alpha';
              case 'memoryType': return 'project';
              case 'metadata': return '{"status": "active"}';
              case 'createdAt': return '2024-01-01T00:00:00Z';
              case 'modifiedAt': return '2024-01-02T00:00:00Z';
              case 'lastAccessed': return '2024-01-03T00:00:00Z';
              default: return null;
            }
          }
        },
        {
          get: (field: string) => {
            switch (field) {
              case 'id': return 'mem2';
              case 'name': return 'Project Beta';
              case 'memoryType': return 'project';
              case 'metadata': return '{"status": "pending"}';
              case 'createdAt': return '2024-01-04T00:00:00Z';
              case 'modifiedAt': return '2024-01-05T00:00:00Z';
              case 'lastAccessed': return '2024-01-06T00:00:00Z';
              default: return null;
            }
          }
        }
      ];

      mockSession.run.mockResolvedValue({ records: mockRecords });

      const results = await repository.getFilteredMemories(mockSession, {
        memoryTypes: ['project', 'note'],
        limit: 50,
        offset: 10
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        id: 'mem1',
        name: 'Project Alpha',
        memoryType: 'project',
        metadata: { status: 'active' }
      });

      // Verify correct query construction
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.memoryType IN $memoryTypes'),
        expect.objectContaining({
          memoryTypes: ['project', 'note'],
          limit: 50,
          offset: 10
        })
      );
    });

    it('should handle filtering without memory types', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await repository.getFilteredMemories(mockSession, {
        limit: 25,
        offset: 0
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE'),
        expect.objectContaining({
          limit: 25,
          offset: 0
        })
      );
    });

    it('should apply default pagination when not specified', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await repository.getFilteredMemories(mockSession, {});

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          limit: 100, // Default limit
          offset: 0   // Default offset
        })
      );
    });

    it('should handle empty result sets gracefully', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const results = await repository.getFilteredMemories(mockSession, {
        memoryTypes: ['nonexistent']
      });

      expect(results).toEqual([]);
    });

    it('should handle malformed metadata gracefully', async () => {
      const recordWithBadMetadata = {
        get: (field: string) => {
          switch (field) {
            case 'id': return 'mem1';
            case 'name': return 'Broken Memory';
            case 'memoryType': return 'broken';
            case 'metadata': return 'invalid json{';
            case 'createdAt': return '2024-01-01T00:00:00Z';
            case 'modifiedAt': return '2024-01-01T00:00:00Z';
            case 'lastAccessed': return '2024-01-01T00:00:00Z';
            default: return null;
          }
        }
      };

      mockSession.run.mockResolvedValue({ records: [recordWithBadMetadata] });

      const results = await repository.getFilteredMemories(mockSession, {});

      expect(results).toHaveLength(1);
      expect(results[0].metadata).toEqual({}); // Should fallback to empty object
    });
  });

  describe('Batch Memory Type Queries - getMemoriesByType', () => {
    it('should retrieve all memories of specific type', async () => {
      const mockRecords = Array.from({ length: 3 }, (_, i) => ({
        get: (field: string) => {
          switch (field) {
            case 'id': return `project-${i}`;
            case 'name': return `Project ${i}`;
            case 'memoryType': return 'project';
            case 'metadata': return '{}';
            case 'createdAt': return `2024-01-0${i + 1}T00:00:00Z`;
            case 'modifiedAt': return `2024-01-0${i + 1}T00:00:00Z`;
            case 'lastAccessed': return `2024-01-0${i + 1}T00:00:00Z`;
            default: return null;
          }
        }
      }));

      mockSession.run.mockResolvedValue({ records: mockRecords });

      const results = await repository.getMemoriesByType(mockSession, 'project');

      expect(results).toHaveLength(3);
      expect(results.every(m => m.memoryType === 'project')).toBe(true);
      
      // Verify ordering by creation date
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.createdAt DESC'),
        { memoryType: 'project' }
      );
    });

    it('should handle non-existent memory types', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const results = await repository.getMemoriesByType(mockSession, 'nonexistent');

      expect(results).toEqual([]);
    });

    it('should handle null metadata correctly', async () => {
      const recordWithNullMetadata = {
        get: (field: string) => {
          switch (field) {
            case 'id': return 'mem1';
            case 'name': return 'Minimal Memory';
            case 'memoryType': return 'minimal';
            case 'metadata': return null;
            case 'createdAt': return '2024-01-01T00:00:00Z';
            case 'modifiedAt': return '2024-01-01T00:00:00Z';
            case 'lastAccessed': return '2024-01-01T00:00:00Z';
            default: return null;
          }
        }
      };

      mockSession.run.mockResolvedValue({ records: [recordWithNullMetadata] });

      const results = await repository.getMemoriesByType(mockSession, 'minimal');

      expect(results[0].metadata).toEqual({});
    });
  });

  describe('Memory Existence Checking - memoryExists', () => {
    it('should return true for existing memory', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: () => true }]
      });

      const exists = await repository.memoryExists(mockSession, 'existing-id');

      expect(exists).toBe(true);
      expect(mockSession.run).toHaveBeenCalledWith(
        'MATCH (m:Memory {id: $id}) RETURN count(m) > 0 as exists',
        { id: 'existing-id' }
      );
    });

    it('should return false for non-existent memory', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: () => false }]
      });

      const exists = await repository.memoryExists(mockSession, 'fake-id');

      expect(exists).toBe(false);
    });

    it('should handle empty result gracefully', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const exists = await repository.memoryExists(mockSession, 'empty-result');

      expect(exists).toBe(false);
    });
  });

  describe('Memory Deletion - deleteMemory', () => {
    it('should delete memory and all related data', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: () => true }]
      });

      const deleted = await repository.deleteMemory(mockSession, 'memory-to-delete');

      expect(deleted).toBe(true);

      // Verify comprehensive deletion query
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Memory {id: $memoryId})'),
        { memoryId: 'memory-to-delete' }
      );

      const query = mockSession.run.mock.calls[0][0];
      expect(query).toContain('DELETE o'); // Deletes observations
      expect(query).toContain('DELETE r'); // Deletes relations
      expect(query).toContain('DELETE m'); // Deletes memory
    });

    it('should return false when memory does not exist', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: () => false }]
      });

      const deleted = await repository.deleteMemory(mockSession, 'nonexistent');

      expect(deleted).toBe(false);
    });

    it('should handle deletion without related data', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: () => true }]
      });

      const deleted = await repository.deleteMemory(mockSession, 'standalone-memory');

      expect(deleted).toBe(true);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle database connection failures', async () => {
      mockSession.run.mockRejectedValue(new Error('Database connection lost'));

      await expect(repository.getCoreMemoryData(mockSession, ['test-id']))
        .rejects
        .toThrow('Database connection lost');
    });

    it('should handle empty ID arrays gracefully', async () => {
      const results = await repository.getCoreMemoryData(mockSession, []);

      expect(results).toEqual([]);
      expect(mockSession.run).not.toHaveBeenCalled();
    });

    it('should handle null ID arrays gracefully', async () => {
      const results = await repository.getCoreMemoryData(mockSession, null as any);

      expect(results).toEqual([]);
      expect(mockSession.run).not.toHaveBeenCalled();
    });

    it('should update lastAccessed timestamp on retrieval', async () => {
      mockSession.run
        .mockResolvedValueOnce({ records: [] }) // lastAccessed update
        .mockResolvedValueOnce({ records: [] }); // actual query

      await repository.getCoreMemoryData(mockSession, ['test-id']);

      expect(mockSession.run).toHaveBeenCalledTimes(2);
      expect(mockSession.run).toHaveBeenNthCalledWith(1,
        'MATCH (m:Memory) WHERE m.id IN $ids SET m.lastAccessed = $timestamp',
        expect.objectContaining({
          ids: ['test-id'],
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('Data Type Conversion & Validation', () => {
    it('should handle various date format inputs', async () => {
      const memoryWithStringDate = {
        ...testMemory,
        createdAt: '2024-01-01T00:00:00Z',
        modifiedAt: new Date(),
        lastAccessed: undefined
      };

      mockSession.run.mockResolvedValue({ records: [{ get: () => testMemory }] });

      await repository.createMemoryNode(mockSession, memoryWithStringDate as any);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          createdAt: '2024-01-01T00:00:00Z',
          modifiedAt: expect.any(String),
          lastAccessed: expect.any(String)
        })
      );
    });

    it('should serialize metadata correctly', async () => {
      const complexMetadata = {
        nested: { object: true },
        array: [1, 2, 3],
        string: 'value',
        number: 42,
        boolean: false
      };

      const memoryWithComplexMetadata = {
        ...testMemory,
        metadata: complexMetadata
      };

      mockSession.run.mockResolvedValue({ records: [{ get: () => testMemory }] });

      await repository.createMemoryNode(mockSession, memoryWithComplexMetadata);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: JSON.stringify(complexMetadata)
        })
      );
    });

    it('should handle missing nameEmbedding gracefully', async () => {
      mockSession.run.mockResolvedValue({ records: [{ get: () => testMemory }] });

      await repository.createMemoryNode(mockSession, testMemory);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          nameEmbedding: null
        })
      );
    });
  });
});
