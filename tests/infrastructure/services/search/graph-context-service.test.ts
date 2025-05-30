/**
 * Graph Context Service Tests - Phase 2E Priority 5
 * The relationship tracker - who's connected to whom
 * 
 * HUNT TARGET: Relationship traversal and context building
 * THREAT LEVEL: Medium - Complex graph operations, Cartesian product risks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphContextService } from '../../../../src/infrastructure/services/search/graph-context-service';
import { DEFAULT_SEARCH_CONFIG } from '../../../../src/domain/entities/search-config';
import neo4j from 'neo4j-driver';

describe('GraphContextService - The Relationship Tracker', () => {
  let graphService: GraphContextService;
  let mockSession: any;

  beforeEach(() => {
    // Mock Neo4j session
    mockSession = {
      run: vi.fn()
    };

    graphService = new GraphContextService(mockSession, DEFAULT_SEARCH_CONFIG);
  });

  describe('Relationship Traversal - The Connection Hunter', () => {
    it('should traverse 2-level depth relationships correctly', async () => {
      // Setup: Mock graph traversal results
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: vi.fn()
              .mockReturnValueOnce('mem1') // memoryId
              .mockReturnValueOnce([ // ancestors
                {
                  id: 'anc1',
                  name: 'Direct Ancestor',
                  type: 'concept',
                  relation: 'INFLUENCES',
                  distance: { toNumber: () => 1 },
                  strength: 0.8,
                  context: ['programming'],
                  source: 'agent',
                  createdAt: '2024-01-01'
                }
              ])
              .mockReturnValueOnce([ // descendants
                {
                  id: 'desc1',
                  name: 'Direct Descendant',
                  type: 'implementation',
                  relation: 'DEPENDS_ON',
                  distance: { toNumber: () => 1 },
                  strength: 0.9,
                  context: ['development'],
                  source: 'user',
                  createdAt: '2024-01-02'
                }
              ])
          }
        ]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: Proper relationship structure
      expect(contextMap.get('mem1')).toBeDefined();
      const context = contextMap.get('mem1')!;
      
      expect(context.ancestors).toHaveLength(1);
      expect(context.ancestors?.[0]).toMatchObject({
        id: 'anc1',
        name: 'Direct Ancestor',
        type: 'concept',
        relation: 'INFLUENCES',
        strength: 0.8,
        context: ['programming'],
        source: 'agent'
      });

      expect(context.descendants).toHaveLength(1);
      expect(context.descendants?.[0]).toMatchObject({
        id: 'desc1',
        name: 'Direct Descendant',
        type: 'implementation',
        relation: 'DEPENDS_ON',
        strength: 0.9,
        context: ['development'],
        source: 'user'
      });
    });

    it('should respect maxRelatedItems limit in traversal', async () => {
      // Setup: Many related memories
      const manyAncestors = Array(10).fill(null).map((_, i) => ({
        id: `anc${i}`,
        name: `Ancestor ${i}`,
        type: 'concept',
        relation: 'INFLUENCES',
        distance: { toNumber: () => 1 }
      }));

      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('mem1')
            .mockReturnValueOnce(manyAncestors)
            .mockReturnValueOnce([])
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: Limited to maxRelatedItems (3 by default)
      const context = contextMap.get('mem1')!;
      expect(context.ancestors).toHaveLength(3);
    });

    it('should handle memories with no relationships', async () => {
      // Setup: Memory with no relationships
      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('isolated')
            .mockReturnValueOnce([]) // No ancestors
            .mockReturnValueOnce([]) // No descendants
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['isolated']);

      // Verify: Empty context map (no relationships)
      expect(contextMap.size).toBe(0);
    });

    it('should extract actual relationship types correctly', async () => {
      // Setup: Various relationship types
      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('mem1')
            .mockReturnValueOnce([
              { id: 'rel1', relation: 'INFLUENCES', distance: { toNumber: () => 1 } },
              { id: 'rel2', relation: 'COMPLEMENTS', distance: { toNumber: () => 1 } },
              { id: 'rel3', relation: 'DEPENDS_ON', distance: { toNumber: () => 2 } }
            ])
            .mockReturnValueOnce([])
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: Actual relation types preserved
      const ancestors = contextMap.get('mem1')?.ancestors;
      expect(ancestors?.[0].relation).toBe('INFLUENCES');
      expect(ancestors?.[1].relation).toBe('COMPLEMENTS');
      expect(ancestors?.[2].relation).toBe('DEPENDS_ON');
    });

    it('should handle multiple memory IDs in batch', async () => {
      // Setup: Multiple memories with relationships
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: vi.fn()
              .mockReturnValueOnce('mem1')
              .mockReturnValueOnce([{ id: 'anc1', relation: 'INFLUENCES', distance: { toNumber: () => 1 } }])
              .mockReturnValueOnce([])
          },
          {
            get: vi.fn()
              .mockReturnValueOnce('mem2')
              .mockReturnValueOnce([])
              .mockReturnValueOnce([{ id: 'desc1', relation: 'DEPENDS_ON', distance: { toNumber: () => 1 } }])
          }
        ]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1', 'mem2']);

      // Verify: Both memories processed
      expect(contextMap.size).toBe(2);
      expect(contextMap.get('mem1')?.ancestors).toHaveLength(1);
      expect(contextMap.get('mem2')?.descendants).toHaveLength(1);
    });
  });

  describe('Enhanced Metadata Support - The Intelligence Gatherer', () => {
    it('should extract relationship metadata correctly', async () => {
      // Setup: Relationship with full metadata
      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('mem1')
            .mockReturnValueOnce([{
              id: 'related1',
              name: 'Related Memory',
              type: 'concept',
              relation: 'INFLUENCES',
              distance: { toNumber: () => 1 },
              strength: 0.85,
              context: ['programming', 'architecture'],
              source: 'agent',
              createdAt: '2024-01-15T10:30:00Z'
            }])
            .mockReturnValueOnce([])
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: All metadata extracted
      const ancestor = contextMap.get('mem1')?.ancestors?.[0];
      expect(ancestor).toMatchObject({
        id: 'related1',
        name: 'Related Memory',
        type: 'concept',
        relation: 'INFLUENCES',
        distance: 1, // Converted from Neo4j Integer
        strength: 0.85,
        context: ['programming', 'architecture'],
        source: 'agent',
        createdAt: '2024-01-15T10:30:00Z'
      });
    });

    it('should handle missing metadata gracefully', async () => {
      // Setup: Relationship with minimal metadata
      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('mem1')
            .mockReturnValueOnce([{
              id: 'minimal',
              name: 'Minimal Relation',
              type: 'basic',
              relation: 'RELATES_TO',
              distance: { toNumber: () => 1 }
              // Missing strength, context, source, createdAt
            }])
            .mockReturnValueOnce([])
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: Missing fields handled
      const ancestor = contextMap.get('mem1')?.ancestors?.[0];
      expect(ancestor.id).toBe('minimal');
      expect(ancestor.relation).toBe('RELATES_TO');
      expect(ancestor.strength).toBeUndefined();
      expect(ancestor.context).toBeUndefined();
    });

    it('should handle cross-domain relationship detection', async () => {
      // Setup: Cross-domain relationships
      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('mem1')
            .mockReturnValueOnce([{
              id: 'cross1',
              name: 'Cross Domain',
              type: 'creative',
              relation: 'INSPIRES',
              distance: { toNumber: () => 1 },
              context: ['programming', 'creative', 'problem-solving']
            }])
            .mockReturnValueOnce([])
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: Cross-domain context preserved
      const ancestor = contextMap.get('mem1')?.ancestors?.[0];
      expect(ancestor.context).toEqual(['programming', 'creative', 'problem-solving']);
      expect(ancestor.relation).toBe('INSPIRES');
    });
  });

  describe('Wildcard Search with Context - The Full Sweep', () => {
    it('should retrieve all memories with proper observation ordering', async () => {
      // Setup: Wildcard search results with observations
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: vi.fn()
              .mockReturnValueOnce('mem1') // id
              .mockReturnValueOnce('Memory 1') // name
              .mockReturnValueOnce('project') // type
              .mockReturnValueOnce('{"status": "active"}') // metadata
              .mockReturnValueOnce(null) // embedding
              .mockReturnValueOnce([ // observationObjects (chronologically ordered)
                { id: 'obs1', content: 'First observation', createdAt: '2024-01-01T10:00:00Z' },
                { id: 'obs2', content: 'Second observation', createdAt: '2024-01-02T10:00:00Z' }
              ])
              .mockReturnValueOnce(['tag1', 'tag2']) // tags
              .mockReturnValueOnce([]) // ancestors
              .mockReturnValueOnce([]) // descendants
          }
        ]
      });

      // Execute
      const results = await graphService.searchWildcardWithContext(10);

      // Verify: Proper structure and ordering
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'mem1',
        name: 'Memory 1',
        type: 'project',
        metadata: { status: 'active' },
        observationObjects: [
          { id: 'obs1', content: 'First observation', createdAt: '2024-01-01T10:00:00Z' },
          { id: 'obs2', content: 'Second observation', createdAt: '2024-01-02T10:00:00Z' }
        ],
        tags: ['tag1', 'tag2'],
        ancestors: [],
        descendants: []
      });
    });

    it('should apply memory type filtering in wildcard search', async () => {
      // Setup: Filtered wildcard search
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: vi.fn()
              .mockReturnValueOnce('proj1')
              .mockReturnValueOnce('Project 1')
              .mockReturnValueOnce('project')
              .mockReturnValueOnce('{}')
              .mockReturnValueOnce(null)
              .mockReturnValueOnce([])
              .mockReturnValueOnce(['project'])
              .mockReturnValueOnce([])
              .mockReturnValueOnce([])
          }
        ]
      });

      // Execute with memory type filter
      const results = await graphService.searchWildcardWithContext(10, ['project', 'research']);

      // Verify: Type filter applied in query
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[0]).toContain('WHERE m.memoryType IN $memoryTypes');
      expect(queryCall[1].memoryTypes).toEqual(['project', 'research']);
      expect(results[0].type).toBe('project');
    });

    it('should enforce limit in wildcard search', async () => {
      // Setup: Many results
      const manyRecords = Array(50).fill(null).map((_, i) => ({
        get: vi.fn()
          .mockReturnValue(`mem${i}`)
          .mockReturnValue(`Memory ${i}`)
          .mockReturnValue('project')
          .mockReturnValue('{}')
          .mockReturnValue(null)
          .mockReturnValue([])
          .mockReturnValue([])
          .mockReturnValue([])
          .mockReturnValue([])
      }));

      mockSession.run.mockResolvedValue({ records: manyRecords });

      // Execute with limit
      const results = await graphService.searchWildcardWithContext(5);

      // Verify: Limit applied in query
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[1].limit.toNumber()).toBe(5);
    });

    it('should prevent Cartesian product in complex queries', async () => {
      // Setup: Memory with many observations, tags, and relationships
      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('complex')
            .mockReturnValueOnce('Complex Memory')
            .mockReturnValueOnce('project')
            .mockReturnValueOnce('{}')
            .mockReturnValueOnce(null)
            .mockReturnValueOnce([ // Many observations
              { id: 'obs1', content: 'Obs 1', createdAt: '2024-01-01' },
              { id: 'obs2', content: 'Obs 2', createdAt: '2024-01-02' },
              { id: 'obs3', content: 'Obs 3', createdAt: '2024-01-03' }
            ])
            .mockReturnValueOnce(['tag1', 'tag2', 'tag3']) // Many tags
            .mockReturnValueOnce([ // Many ancestors
              { id: 'anc1', relation: 'INFLUENCES' },
              { id: 'anc2', relation: 'COMPLEMENTS' }
            ])
            .mockReturnValueOnce([ // Many descendants
              { id: 'desc1', relation: 'DEPENDS_ON' }
            ])
        }]
      });

      // Execute
      const results = await graphService.searchWildcardWithContext(10);

      // Verify: Proper aggregation without Cartesian explosion
      expect(results).toHaveLength(1);
      expect(results[0].observationObjects).toHaveLength(3);
      expect(results[0].tags).toHaveLength(3);
      expect(results[0].ancestors).toHaveLength(2);
      expect(results[0].descendants).toHaveLength(1);
    });
  });

  describe('Error Scenarios - The Exception Investigation', () => {
    it('should handle database connection failures gracefully', async () => {
      // Setup: Database failure
      mockSession.run.mockRejectedValue(new Error('Database connection lost'));

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: Empty context map on failure
      expect(contextMap.size).toBe(0);
    });

    it('should handle malformed relationship data', async () => {
      // Setup: Malformed relationship records
      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('mem1')
            .mockReturnValueOnce([ // Malformed ancestors
              { id: null, relation: 'INFLUENCES' }, // Null ID
              { relation: 'COMPLEMENTS' }, // Missing ID
              { id: 'valid', relation: 'DEPENDS_ON', distance: 1 } // Valid
            ])
            .mockReturnValueOnce([])
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['mem1']);

      // Verify: Only valid relationships included
      const context = contextMap.get('mem1');
      expect(context?.ancestors).toHaveLength(1);
      expect(context?.ancestors?.[0].id).toBe('valid');
    });

    it('should handle empty memory ID arrays', async () => {
      // Execute with empty array
      const contextMap = await graphService.getGraphContext([]);

      // Verify: Empty result without database call
      expect(contextMap.size).toBe(0);
      expect(mockSession.run).not.toHaveBeenCalled();
    });

  });

  describe('Performance and Scalability - The Load Test', () => {
    it('should handle large memory ID batches efficiently', async () => {
      // Setup: Large batch of memory IDs
      const largeBatch = Array(100).fill(null).map((_, i) => `mem${i}`);
      
      mockSession.run.mockResolvedValue({
        records: largeBatch.map((id, i) => ({
          get: vi.fn()
            .mockReturnValueOnce(id)
            .mockReturnValueOnce(i % 2 === 0 ? [{ id: `anc${i}`, relation: 'INFLUENCES', distance: 1 }] : [])
            .mockReturnValueOnce([])
        }))
      });

      // Execute
      const contextMap = await graphService.getGraphContext(largeBatch);

      // Verify: Efficient processing without performance degradation
      expect(contextMap.size).toBe(50); // Only even-indexed have relationships
      expect(mockSession.run).toHaveBeenCalledTimes(1); // Single batch query
    });

    it('should optimize query for relationship depth limits', async () => {
      // Execute with different config
      const customConfig = { ...DEFAULT_SEARCH_CONFIG, maxGraphDepth: 1 };
      const customService = new GraphContextService(mockSession, customConfig);
      
      mockSession.run.mockResolvedValue({ records: [] });

      // Execute
      await customService.getGraphContext(['mem1']);

      // Verify: Query uses correct depth limit
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[0]).toContain('*1..1'); // Single level depth
    });

    it('should limit results efficiently with large graphs', async () => {
      // Setup: Memory with many relationships
      const manyRelationships = Array(20).fill(null).map((_, i) => ({
        id: `rel${i}`,
        name: `Relation ${i}`,
        relation: 'RELATES_TO',
        distance: { toNumber: () => 1 }
      }));

      mockSession.run.mockResolvedValue({
        records: [{
          get: vi.fn()
            .mockReturnValueOnce('hub')
            .mockReturnValueOnce(manyRelationships)
            .mockReturnValueOnce(manyRelationships)
        }]
      });

      // Execute
      const contextMap = await graphService.getGraphContext(['hub']);

      // Verify: Results limited to maxRelatedItems
      const context = contextMap.get('hub');
      expect(context?.ancestors).toHaveLength(3); // Limited by config
      expect(context?.descendants).toHaveLength(3); // Limited by config
    });
  });

  describe('Integration Scenarios - The Full System Test', () => {
    it('should integrate with memory type filtering and limits', async () => {
      // Setup: Complex integration scenario
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: vi.fn()
              .mockReturnValueOnce('filtered1')
              .mockReturnValueOnce('Filtered Memory')
              .mockReturnValueOnce('project')
              .mockReturnValueOnce('{"priority": "high"}')
              .mockReturnValueOnce([0.1, 0.2, 0.3])
              .mockReturnValueOnce([
                { id: 'obs1', content: 'Project observation', createdAt: '2024-01-01' }
              ])
              .mockReturnValueOnce(['project', 'important'])
              .mockReturnValueOnce([
                { id: 'concept1', relation: 'INFLUENCES', distance: 1, strength: 0.8 }
              ])
              .mockReturnValueOnce([
                { id: 'impl1', relation: 'DEPENDS_ON', distance: 1, strength: 0.9 }
              ])
          }
        ]
      });

      // Execute with all parameters
      const results = await graphService.searchWildcardWithContext(5, ['project']);

      // Verify: Complete integration
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'filtered1',
        name: 'Filtered Memory',
        type: 'project',
        metadata: { priority: 'high' },
        embedding: [0.1, 0.2, 0.3],
        observationObjects: [
          { id: 'obs1', content: 'Project observation', createdAt: '2024-01-01' }
        ],
        tags: ['project', 'important'],
        ancestors: [
          { id: 'concept1', relation: 'INFLUENCES', distance: 1, strength: 0.8 }
        ],
        descendants: [
          { id: 'impl1', relation: 'DEPENDS_ON', distance: 1, strength: 0.9 }
        ]
      });
    });
  });
});
