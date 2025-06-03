/**
 * WildcardSearchService Test Suite
 * Target: Achieve 75% coverage for infrastructure foundation
 * 
 * Coverage Scope:
 * - Basic wildcard search execution 
 * - Graph context inclusion/exclusion
 * - Memory type filtering
 * - Result mapping and processing
 * - Neo4j integer conversion
 * - Error handling for malformed data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WildcardSearchService } from '../../../../src/infrastructure/services/search/wildcard-search-service';
import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

// Mock Neo4j driver
vi.mock('neo4j-driver', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    int: vi.fn((value: number) => ({ toNumber: () => value, value }))
  };
});

describe('WildcardSearchService', () => {
  let service: WildcardSearchService;
  let mockSession: Session;

  beforeEach(() => {
    mockSession = {
      run: vi.fn()
    } as any;
    service = new WildcardSearchService(mockSession);
  });

  describe('Basic Wildcard Search', () => {
    it('should execute basic wildcard search without graph context', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{"key": "value"}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [
                  { id: 'obs-1', content: 'Test observation', createdAt: '2024-01-01T01:00:00Z' }
                ];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, false);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Memory)'),
        expect.objectContaining({
          memoryTypes: undefined,
          limit: expect.anything()
        })
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'test-memory-1',
        name: 'Test Memory',
        type: 'note',
        score: 1.0,
        metadata: { key: 'value' },
        observations: [
          { id: 'obs-1', content: 'Test observation', createdAt: '2024-01-01T01:00:00Z' }
        ]
      });
    });

    it('should execute wildcard search with memory type filtering', async () => {
      const mockResult = { records: [] };
      (mockSession.run as any).mockResolvedValue(mockResult);

      await service.search(10, false, ['note', 'task']);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.memoryType IN $memoryTypes'),
        expect.objectContaining({
          memoryTypes: ['note', 'task'],
          limit: expect.anything()
        })
      );
    });

    it('should handle empty results gracefully', async () => {
      const mockResult = { records: [] };
      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, false);

      expect(results).toEqual([]);
    });
  });

  describe('Graph Context Search', () => {
    it('should execute wildcard search with graph context', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [];
                case 'ancestors': return [
                  {
                    id: 'ancestor-1',
                    name: 'Parent Memory',
                    type: 'parent',
                    relation: 'INFLUENCES',
                    distance: { toNumber: () => 1 },
                    strength: 0.8,
                    source: 'agent',
                    createdAt: '2024-01-01T00:00:00Z'
                  }
                ];
                case 'descendants': return [
                  {
                    id: 'descendant-1',
                    name: 'Child Memory',
                    type: 'child',
                    relation: 'DEPENDS_ON',
                    distance: { toNumber: () => 1 },
                    strength: 0.7,
                    source: 'user',
                    createdAt: '2024-01-02T00:00:00Z'
                  }
                ];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, true);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('OPTIONAL MATCH path1 = (ancestor:Memory)'),
        expect.anything()
      );

      expect(results[0].related).toBeDefined();
      expect(results[0].related?.ancestors).toHaveLength(1);
      expect(results[0].related?.descendants).toHaveLength(1);
      expect(results[0].related?.ancestors?.[0]).toMatchObject({
        id: 'ancestor-1',
        name: 'Parent Memory',
        relation: 'INFLUENCES',
        distance: 1
      });
    });

    it('should handle graph context with empty relations', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, true);

      expect(results[0].related).toBeUndefined();
    });
  });

  describe('Data Processing', () => {
    it('should process observations correctly', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [
                  { id: 'obs-1', content: 'Valid observation', createdAt: '2024-01-01T01:00:00Z' },
                  { id: 'obs-2', content: '', createdAt: '2024-01-01T02:00:00Z' }, // Empty content - should be filtered
                  { id: 'obs-3', content: 'Another valid observation' }, // Missing createdAt - should use default
                  null, // Null observation - should be filtered
                  { content: 'No ID observation', createdAt: '2024-01-01T04:00:00Z' }
                ];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, false);

      expect(results[0].observations).toHaveLength(3);
      expect(results[0].observations[0]).toMatchObject({
        id: 'obs-1',
        content: 'Valid observation',
        createdAt: '2024-01-01T01:00:00Z'
      });
      expect(results[0].observations[1]).toMatchObject({
        content: 'Another valid observation',
        createdAt: expect.any(String) // Should have default timestamp
      });
      expect(results[0].observations[2]).toMatchObject({
        content: 'No ID observation',
        createdAt: '2024-01-01T04:00:00Z'
      });
    });

    it('should handle non-array observations gracefully', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return null; // Non-array observation
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, false);

      expect(results[0].observations).toEqual([]);
    });

    it('should parse metadata correctly', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{"status": "active", "priority": 1}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, false);

      expect(results[0].metadata).toEqual({
        status: 'active',
        priority: 1
      });
    });

    it('should handle invalid metadata gracefully', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return 'invalid-json{';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, false);

      expect(results[0].metadata).toEqual({});
    });

    it('should handle null metadata gracefully', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return null;
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, false);

      expect(results[0].metadata).toEqual({});
    });
  });

  describe('Neo4j Integer Conversion', () => {
    it('should convert Neo4j integers for distance fields', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [];
                case 'ancestors': return [
                  {
                    id: 'ancestor-1',
                    name: 'Parent Memory',
                    type: 'parent',
                    relation: 'INFLUENCES',
                    distance: { toNumber: () => 2 }, // Neo4j Integer object
                    strength: 0.8
                  }
                ];
                case 'descendants': return [];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, true);

      expect(results[0].related?.ancestors?.[0].distance).toBe(2);
    });

    it('should handle items without Neo4j integer distance', async () => {
      const mockResult = {
        records: [
          {
            get: vi.fn((key: string) => {
              switch (key) {
                case 'id': return 'test-memory-1';
                case 'name': return 'Test Memory';
                case 'type': return 'note';
                case 'metadata': return '{}';
                case 'createdAt': return '2024-01-01T00:00:00Z';
                case 'modifiedAt': return '2024-01-02T00:00:00Z';
                case 'lastAccessed': return '2024-01-03T00:00:00Z';
                case 'observations': return [];
                case 'ancestors': return [
                  {
                    id: 'ancestor-1',
                    name: 'Parent Memory',
                    type: 'parent',
                    relation: 'INFLUENCES',
                    distance: 1, // Already a regular number
                    strength: 0.8
                  }
                ];
                case 'descendants': return [];
                default: return null;
              }
            })
          }
        ]
      };

      (mockSession.run as any).mockResolvedValue(mockResult);

      const results = await service.search(10, true);

      expect(results[0].related?.ancestors?.[0].distance).toBe(1);
    });
  });

  describe('Query Building', () => {
    it('should build basic query without WHERE clause for no memory types', async () => {
      const mockResult = { records: [] };
      (mockSession.run as any).mockResolvedValue(mockResult);

      await service.search(10, false);

      const [cypherQuery] = (mockSession.run as any).mock.calls[0];
      expect(cypherQuery).toContain('MATCH (m:Memory)');
      expect(cypherQuery).not.toContain('WHERE m.memoryType IN $memoryTypes');
    });

    it('should build query with WHERE clause for memory types', async () => {
      const mockResult = { records: [] };
      (mockSession.run as any).mockResolvedValue(mockResult);

      await service.search(10, false, ['note']);

      const [cypherQuery] = (mockSession.run as any).mock.calls[0];
      expect(cypherQuery).toContain('WHERE m.memoryType IN $memoryTypes');
    });

    it('should use graph context query when includeGraphContext is true', async () => {
      const mockResult = { records: [] };
      (mockSession.run as any).mockResolvedValue(mockResult);

      await service.search(10, true);

      const [cypherQuery] = (mockSession.run as any).mock.calls[0];
      expect(cypherQuery).toContain('OPTIONAL MATCH path1 = (ancestor:Memory)');
      expect(cypherQuery).toContain('OPTIONAL MATCH path2 = (m)-[rel2:RELATES_TO*1..2]->(descendant:Memory)');
    });

    it('should pass correct parameters to Neo4j session', async () => {
      const mockResult = { records: [] };
      (mockSession.run as any).mockResolvedValue(mockResult);

      await service.search(25, false, ['note', 'task']);

      const [, params] = (mockSession.run as any).mock.calls[0];
      expect(params).toEqual({
        memoryTypes: ['note', 'task'],
        limit: expect.objectContaining({ low: 25, high: 0 })
      });
    });
  });
});
