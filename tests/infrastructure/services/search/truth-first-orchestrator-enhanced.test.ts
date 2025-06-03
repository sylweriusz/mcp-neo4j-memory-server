/**
 * Truth-First Search Orchestrator - Enhanced Coverage Tests
 * Target: Increase coverage from 55.05% to 85%+
 * Focus: Missing scenarios in lines 185-288, 291-297
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TruthFirstSearchOrchestrator } from '../../../../src/infrastructure/services/search/truth-first-search-orchestrator';
import { Session } from 'neo4j-driver';

describe('TruthFirstSearchOrchestrator - Enhanced Coverage', () => {
  let orchestrator: TruthFirstSearchOrchestrator;
  let mockSession: Session;

  beforeEach(() => {
    mockSession = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as Session;
    
    orchestrator = new TruthFirstSearchOrchestrator(mockSession);
  });

  afterEach(async () => {
    await mockSession.close();
  });

  describe('Multi-Channel Search Coordination', () => {
    it('should handle empty exact candidates with vector results', async () => {
      // Mock vector channel returning results while exact channel returns empty
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ records: [] }) // Exact search: empty
        .mockResolvedValueOnce({ // Vector search: has results
          records: [
            { get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'test-id-1' : 0.8) }
          ]
        })
        .mockResolvedValueOnce({ // Enrichment query
          records: [{
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return 'test-id-1';
                case 'name': return 'Test Memory';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            })
          }]
        });

      const results = await orchestrator.search('semantic query', 10);

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('semantic');
      expect(mockSession.run).toHaveBeenCalledTimes(3);
    });

    it('should combine exact and vector candidates correctly', async () => {
      // Mock both channels returning overlapping results
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ // Exact search
          records: [{
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return 'overlap-id';
                case 'name': return 'Overlap Memory';
                case 'metadata': return '{"exact": true}';
                case 'exactMetadata': return true;
                case 'exactName': return false;
                case 'exactContent': return false;
                default: return null;
              }
            })
          }]
        })
        .mockResolvedValueOnce({ // Vector search
          records: [{
            get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'overlap-id' : 0.9)
          }]
        })
        .mockResolvedValueOnce({ // Enrichment
          records: [{
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return 'overlap-id';
                case 'name': return 'Overlap Memory';
                case 'type': return 'test';
                case 'metadata': return '{"exact": true}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            })
          }]
        });

      const results = await orchestrator.search('overlap query', 10);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('overlap-id');
      expect(results[0].matchType).toBe('exact'); // Exact match should win
      expect(results[0].score).toBeGreaterThan(0.8); // High confidence score
    });

    it('should handle vector channel failure gracefully', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ // Exact search succeeds
          records: [{
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return 'exact-only';
                case 'name': return 'Exact Only';
                case 'metadata': return '{}';
                case 'exactMetadata': return false;
                case 'exactName': return true;
                case 'exactContent': return false;
                default: return null;
              }
            })
          }]
        })
        .mockRejectedValueOnce(new Error('Vector service unavailable')) // Vector search fails
        .mockResolvedValueOnce({ // Enrichment
          records: [{
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return 'exact-only';
                case 'name': return 'Exact Only';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            })
          }]
        });

      const results = await orchestrator.search('exact query', 10);

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('exact');
      expect(results[0].id).toBe('exact-only');
    });
  });

  describe('Memory Type Filtering Integration', () => {
    it('should apply memory type filters to exact search', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ records: [] }) // Exact search with filter
        .mockResolvedValueOnce({ records: [] }); // Enrichment

      await orchestrator.search('test query', 10, true, ['project', 'task']);

      const exactSearchCall = (mockSession.run as any).mock.calls[0];
      expect(exactSearchCall[1]).toEqual(
        expect.objectContaining({
          memoryTypes: ['project', 'task']
        })
      );
    });

    it('should apply memory type filters to vector search', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ records: [] }) // Exact search
        .mockResolvedValueOnce({ records: [] }) // Vector search with filter
        .mockResolvedValueOnce({ records: [] }); // Enrichment

      await orchestrator.search('semantic query', 10, true, ['note']);

      const vectorSearchCall = (mockSession.run as any).mock.calls[1];
      expect(vectorSearchCall[1]).toEqual(
        expect.objectContaining({
          memoryTypes: ['note']
        })
      );
    });

    it('should filter enrichment results by memory type', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ 
          records: [{
            get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'filtered-id' : null)
          }]
        })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] }); // Enrichment returns empty due to filter

      const results = await orchestrator.search('filtered', 10, true, ['project']);

      expect(results).toHaveLength(0); // Filtered out during enrichment
      
      const enrichmentCall = (mockSession.run as any).mock.calls[2];
      expect(enrichmentCall[1]).toEqual(
        expect.objectContaining({
          memoryTypes: ['project']
        })
      );
    });
  });

  describe('Graph Context Enrichment Edge Cases', () => {
    it('should handle enrichment query failure', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ 
          records: [{
            get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'test-id' : null)
          }]
        })
        .mockResolvedValueOnce({ records: [] })
        .mockRejectedValueOnce(new Error('Enrichment query failed'));

      const results = await orchestrator.search('test', 10);

      // Should return candidates without enrichment
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test-id');
      expect(results[0].name).toBe(''); // Not enriched
    });

    it('should process complex graph relationships correctly', async () => {
      const complexRelatedData = {
        ancestors: [
          { id: 'ancestor-1', name: 'Parent', type: 'project', relation: 'CONTAINS', distance: { toNumber: () => 1 } }
        ],
        descendants: [
          { id: 'child-1', name: 'Child', type: 'task', relation: 'BELONGS_TO', distance: { toNumber: () => 1 } },
          { id: 'child-2', name: 'Child 2', type: 'note', relation: 'REFERENCES', distance: { toNumber: () => 2 } }
        ]
      };

      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ 
          records: [{
            get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'complex-id' : null)
          }]
        })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          records: [{
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return 'complex-id';
                case 'name': return 'Complex Memory';
                case 'type': return 'project';
                case 'ancestors': return complexRelatedData.ancestors;
                case 'descendants': return complexRelatedData.descendants;
                case 'observations': return [
                  { id: 'obs-1', content: 'First observation', createdAt: '2024-01-01T00:00:00Z' },
                  { id: 'obs-2', content: 'Second observation', createdAt: '2024-01-02T00:00:00Z' }
                ];
                default: return '{}';
              }
            })
          }]
        });

      const results = await orchestrator.search('complex', 10);

      expect(results).toHaveLength(1);
      expect(results[0].related?.ancestors).toHaveLength(1);
      expect(results[0].related?.descendants).toHaveLength(2);
      expect(results[0].observations).toHaveLength(2);
    });
  });

  describe('Performance and Limit Enforcement', () => {
    it('should enforce strict limit regardless of candidate count', async () => {
      // Generate more candidates than limit
      const manyRecords = Array.from({ length: 15 }, (_, i) => ({
        get: vi.fn().mockImplementation((key: string) => {
          switch (key) {
            case 'id': return `candidate-${i}`;
            case 'name': return `Candidate ${i}`;
            case 'metadata': return '{}';
            case 'exactMetadata': return i < 5; // First 5 are exact matches
            case 'exactName': return false;
            case 'exactContent': return false;
            default: return null;
          }
        })
      }));

      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ records: manyRecords })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          records: manyRecords.map((record, i) => ({
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return `candidate-${i}`;
                case 'name': return `Candidate ${i}`;
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            })
          }))
        });

      const results = await orchestrator.search('many results', 5); // Limit to 5

      expect(results).toHaveLength(5); // Strictly enforced
    });

    it('should apply threshold filtering correctly', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ records: [] }) // No exact matches
        .mockResolvedValueOnce({ // Vector results with varying scores
          records: [
            { get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'high-score' : 0.9) },
            { get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'low-score' : 0.2) }, // Below threshold
            { get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'mid-score' : 0.6) }
          ]
        })
        .mockResolvedValueOnce({
          records: [
            { get: vi.fn().mockImplementation((key: string) => {
              const idMap = { 'high-score': 'High', 'mid-score': 'Mid' };
              switch (key) {
                case 'id': return key.includes('high') ? 'high-score' : 'mid-score';
                case 'name': return idMap[key as keyof typeof idMap] || 'Unknown';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            })}
          ]
        });

      const results = await orchestrator.search('threshold test', 10, true, undefined, 0.5);

      // Should only include results above threshold (0.5)
      expect(results).toHaveLength(2); // high-score and mid-score only
      expect(results.find(r => r.id === 'low-score')).toBeUndefined();
    });
  });

  describe('Edge Case Input Validation', () => {
    it('should handle null/undefined query', async () => {
      await expect(orchestrator.search(null as any)).rejects.toThrow('Search query must be a non-empty string');
      await expect(orchestrator.search(undefined as any)).rejects.toThrow('Search query must be a non-empty string');
      await expect(orchestrator.search('')).rejects.toThrow('Search query must be a non-empty string');
    });

    it('should handle negative or zero limit', async () => {
      await expect(orchestrator.search('test', 0)).rejects.toThrow('Search limit must be positive');
      await expect(orchestrator.search('test', -5)).rejects.toThrow('Search limit must be positive');
    });

    it('should handle malformed observation data', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ 
          records: [{
            get: vi.fn().mockImplementation((key: string) => 
              key === 'id' ? 'malformed-obs' : null)
          }]
        })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          records: [{
            get: vi.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'id': return 'malformed-obs';
                case 'name': return 'Malformed Memory';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [
                  null, // Invalid observation
                  { content: null, createdAt: '2024-01-01T00:00:00Z' }, // Missing content
                  { id: 'obs-1', content: 'Valid observation', createdAt: '2024-01-01T00:00:00Z' }
                ];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            })
          }]
        });

      const results = await orchestrator.search('malformed', 10);

      expect(results).toHaveLength(1);
      expect(results[0].observations).toHaveLength(1); // Only valid observation included
      expect(results[0].observations[0].content).toBe('Valid observation');
    });
  });
});
