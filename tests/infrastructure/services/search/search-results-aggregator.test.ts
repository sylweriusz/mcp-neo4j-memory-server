/**
 * Search Results Aggregator Tests - Phase 2D Priority 4
 * The evidence processor - making sense of clues
 * 
 * HUNT TARGET: Scoring, ranking, and result formatting
 * THREAT LEVEL: Medium - Complex scoring algorithms and result transformation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchResultsAggregator } from '../../../../src/infrastructure/services/search/search-results-aggregator';
import { DEFAULT_SEARCH_CONFIG } from '../../../../src/domain/entities/search-config';

describe('SearchResultsAggregator - The Evidence Processor', () => {
  let aggregator: SearchResultsAggregator;

  beforeEach(() => {
    aggregator = new SearchResultsAggregator(DEFAULT_SEARCH_CONFIG);
  });

  describe('Composite Scoring Algorithm - The Truth Calculator', () => {
    it('should calculate weighted scores correctly', async () => {
      // Setup: Sample result and candidate lists
      const mockResult = {
        id: 'mem1',
        name: 'Machine Learning Project',
        type: 'project',
        observations: [
          { content: 'Deep learning implementation', createdAt: '2024-01-01' }
        ],
        tags: ['ml', 'ai'],
        metadata: { status: 'active' }
      };

      const vectorCandidates = ['mem1']; // 50% weight
      const exactMatches = ['mem1']; // 25% weight
      const fulltextMatches = []; // 15% weight
      const tagMatches = ['mem1']; // 10% weight

      // Execute scoring
      const results = await aggregator.scoreAndRankResults(
        'machine learning',
        [mockResult],
        vectorCandidates,
        exactMatches,
        fulltextMatches,
        tagMatches
      );

      // Verify: Weighted score calculation (0.5 + 0.25 + 0.1 = 0.85 base)
      expect(results[0].score).toBeGreaterThan(0.8); // Base score plus bonuses
      expect(results[0].score).toBeLessThanOrEqual(1.0); // Capped at 1.0
    });

    it('should apply name match bonuses correctly', async () => {
      // Setup: Results with different name match qualities
      const exactNameMatch = {
        id: 'exact',
        name: 'python',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      const partialNameMatch = {
        id: 'partial',
        name: 'python programming',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      const noNameMatch = {
        id: 'none',
        name: 'javascript development',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      // Execute with query 'python'
      const results = await aggregator.scoreAndRankResults(
        'python',
        [exactNameMatch, partialNameMatch, noNameMatch],
        [], [], [], []
      );

      // Verify: Name match bonuses applied
      const exactScore = results.find(r => r.id === 'exact')?.score || 0;
      const partialScore = results.find(r => r.id === 'partial')?.score || 0;
      const noneScore = results.find(r => r.id === 'none')?.score || 0;

      expect(exactScore).toBeGreaterThan(partialScore);
      expect(partialScore).toBeGreaterThan(noneScore);
    });

    it('should apply observation match bonuses with diminishing returns', async () => {
      // Setup: Results with different observation match counts
      const manyMatches = {
        id: 'many',
        name: 'Test',
        type: 'project',
        observations: [
          { content: 'python script one', createdAt: '2024-01-01' },
          { content: 'python script two', createdAt: '2024-01-02' },
          { content: 'python script three', createdAt: '2024-01-03' },
          { content: 'python script four', createdAt: '2024-01-04' }
        ],
        tags: [],
        metadata: {}
      };

      const fewMatches = {
        id: 'few',
        name: 'Test',
        type: 'project',
        observations: [
          { content: 'python basic usage', createdAt: '2024-01-01' }
        ],
        tags: [],
        metadata: {}
      };

      // Execute with query 'python'
      const results = await aggregator.scoreAndRankResults(
        'python',
        [manyMatches, fewMatches],
        [], [], [], []
      );

      // Verify: Diminishing returns (max 0.15 bonus)
      const manyScore = results.find(r => r.id === 'many')?.score || 0;
      const fewScore = results.find(r => r.id === 'few')?.score || 0;

      expect(manyScore).toBeGreaterThan(fewScore);
      expect(manyScore - fewScore).toBeLessThanOrEqual(0.15); // Capped bonus
    });

    it('should cap final scores at 1.0', async () => {
      // Setup: Result that would score > 1.0
      const perfectMatch = {
        id: 'perfect',
        name: 'machine learning',
        type: 'project',
        observations: [
          { content: 'machine learning algorithm', createdAt: '2024-01-01' },
          { content: 'machine learning model', createdAt: '2024-01-02' }
        ],
        tags: ['machine-learning'],
        metadata: {}
      };

      // All candidate lists include the perfect match
      const allLists = ['perfect'];

      // Execute
      const results = await aggregator.scoreAndRankResults(
        'machine learning',
        [perfectMatch],
        allLists, allLists, allLists, allLists
      );

      // Verify: Score capped at 1.0
      expect(results[0].score).toBe(1.0);
    });
  });

  describe('Result Ranking - The Priority Sorter', () => {
    it('should sort results by score descending', async () => {
      // Setup: Multiple results with different scoring potential
      const highScore = {
        id: 'high',
        name: 'machine learning',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      const mediumScore = {
        id: 'medium',
        name: 'learning systems',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      const lowScore = {
        id: 'low',
        name: 'random project',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      // Execute with different candidate participation
      const results = await aggregator.scoreAndRankResults(
        'machine learning',
        [lowScore, highScore, mediumScore],
        ['high'], // Only high in vector
        ['high', 'medium'], // High and medium in exact
        [], []
      );

      // Verify: Sorted by score descending (handle case where threshold filters results)
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('high');
      if (results.length > 1) {
        expect(results[1].id).toBe('medium');
      }
      if (results.length > 2) {
        expect(results[2].id).toBe('low');
      }
    });

    it('should filter results below threshold', async () => {
      // Setup: Results with varying scores
      const aboveThreshold = {
        id: 'above',
        name: 'machine learning',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      const belowThreshold = {
        id: 'below',
        name: 'random stuff',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      // Execute with higher threshold
      const config = { ...DEFAULT_SEARCH_CONFIG, threshold: 0.5 };
      const highThresholdAggregator = new SearchResultsAggregator(config);
      
      const results = await highThresholdAggregator.scoreAndRankResults(
        'machine learning',
        [aboveThreshold, belowThreshold],
        ['above'], ['above'], [], []
      );

      // Verify: Only above-threshold results included
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('above');
    });

    it('should handle ties in scoring gracefully', async () => {
      // Setup: Results with identical scoring
      const tie1 = {
        id: 'tie1',
        name: 'identical',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      const tie2 = {
        id: 'tie2',
        name: 'identical',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {}
      };

      // Execute with identical candidate participation
      const results = await aggregator.scoreAndRankResults(
        'test',
        [tie1, tie2],
        ['tie1', 'tie2'], ['tie1', 'tie2'], [], []
      );

      // Verify: Both results included with same score
      expect(results).toHaveLength(2);
      expect(results[0].score).toBe(results[1].score);
    });
  });

  describe('Observation Object Processing - The Data Cleaner', () => {
    it('should process observation objects with proper ordering', () => {
      // Setup: Observation objects with various states
      const observationObjects = [
        { id: 'obs3', content: 'Third observation', createdAt: '2024-01-03T10:00:00Z' },
        { id: 'obs1', content: 'First observation', createdAt: '2024-01-01T10:00:00Z' },
        { id: 'obs2', content: 'Second observation', createdAt: '2024-01-02T10:00:00Z' },
        { content: 'Observation without ID', createdAt: '2024-01-04T10:00:00Z' },
        null, // Null observation
        { id: 'obs5', content: '', createdAt: '2024-01-05T10:00:00Z' } // Empty content
      ];

      // Execute
      const processed = aggregator.processObservationObjects(observationObjects);

      // Verify: Proper filtering and chronological ordering
      expect(processed).toHaveLength(4); // Valid observations only
      expect(processed[0].id).toBe('obs1'); // Chronologically first
      expect(processed[1].id).toBe('obs2');
      expect(processed[2].id).toBe('obs3');
      expect(processed[3].id).toBeUndefined(); // No ID observation included
    });

    it('should handle empty or null observation arrays', () => {
      // Execute with various empty inputs
      const emptyArray = aggregator.processObservationObjects([]);
      const nullInput = aggregator.processObservationObjects(null as any);
      const undefinedInput = aggregator.processObservationObjects(undefined as any);

      // Verify: All return empty arrays
      expect(emptyArray).toEqual([]);
      expect(nullInput).toEqual([]);
      expect(undefinedInput).toEqual([]);
    });

    it('should include observation IDs as required by GDD v2.1.1', () => {
      // Setup: Observation with ID
      const observationObjects = [
        { id: 'obs123', content: 'Test observation', createdAt: '2024-01-01T10:00:00Z' }
      ];

      // Execute
      const processed = aggregator.processObservationObjects(observationObjects);

      // Verify: ID preserved (required for deletion operations)
      expect(processed[0].id).toBe('obs123');
      expect(processed[0].content).toBe('Test observation');
      expect(processed[0].createdAt).toBe('2024-01-01T10:00:00Z');
    });
  });

  describe('Neo4j Integer Conversion - The Data Type Detective', () => {
    it('should convert Neo4j Integer objects to numbers', () => {
      // Setup: Mock Neo4j Integer
      const neo4jInteger = {
        toNumber: vi.fn().mockReturnValue(5),
        low: 5,
        high: 0
      };

      // Execute conversion via aggregator's private method (accessed through formatSearchResults)
      const rawResults = [{
        id: 'mem1',
        name: 'Test',
        type: 'project',
        observationObjects: [],
        tags: [],
        metadata: {},
        ancestors: [{ id: 'anc1', distance: neo4jInteger }],
        descendants: [{ id: 'desc1', distance: neo4jInteger }]
      }];

      const formatted = aggregator.formatSearchResults(rawResults, true);

      // Verify: Distances converted to numbers
      expect(formatted[0].related?.ancestors?.[0].distance).toBe(5);
      expect(formatted[0].related?.descendants?.[0].distance).toBe(5);
      expect(typeof formatted[0].related?.ancestors?.[0].distance).toBe('number');
    });

    it('should handle mixed distance types gracefully', () => {
      // Setup: Mixed distance types
      const rawResults = [{
        id: 'mem1',
        name: 'Test',
        type: 'project',
        observationObjects: [],
        tags: [],
        metadata: {},
        ancestors: [
          { id: 'anc1', distance: 3 }, // Regular number
          { id: 'anc2', distance: { toNumber: () => 7 } }, // Neo4j Integer
          { id: 'anc3', distance: null }, // Null
          { id: 'anc4', distance: undefined } // Undefined
        ]
      }];

      const formatted = aggregator.formatSearchResults(rawResults, true);

      // Verify: All distances properly converted
      const ancestors = formatted[0].related?.ancestors;
      expect(ancestors?.[0].distance).toBe(3);
      expect(ancestors?.[1].distance).toBe(7);
      expect(ancestors?.[2].distance).toBe(0); // Null converted to 0
      expect(ancestors?.[3].distance).toBe(0); // Undefined converted to 0
    });

    it('should handle malformed Neo4j Integer objects', () => {
      // Setup: Malformed Neo4j objects
      const rawResults = [{
        id: 'mem1',
        name: 'Test',
        type: 'project',
        observationObjects: [],
        tags: [],
        metadata: {},
        descendants: [
          { id: 'desc1', distance: { low: 'invalid', high: 'invalid' } },
          { id: 'desc2', distance: 'string_value' },
          { id: 'desc3', distance: NaN }
        ]
      }];

      const formatted = aggregator.formatSearchResults(rawResults, true);

      // Verify: Malformed values handled gracefully
      const descendants = formatted[0].related?.descendants;
      expect(descendants?.[0].distance).toBe(0); // Invalid object
      expect(descendants?.[1].distance).toBe(0); // String value
      expect(descendants?.[2].distance).toBe(0); // NaN value
    });
  });

  describe('Result Formatting - The Presentation Layer', () => {
    it('should format search results with all required fields', () => {
      // Setup: Raw search results
      const rawResults = [{
        id: 'mem1',
        name: 'Test Memory',
        type: 'project',
        observationObjects: [
          { id: 'obs1', content: 'Test observation', createdAt: '2024-01-01' }
        ],
        tags: ['test', 'memory'],
        metadata: '{"status": "active"}',
        score: 0.85
      }];

      // Execute
      const formatted = aggregator.formatSearchResults(rawResults, false);

      // Verify: All fields properly formatted
      expect(formatted[0]).toMatchObject({
        id: 'mem1',
        name: 'Test Memory',
        type: 'project',
        observations: [
          { id: 'obs1', content: 'Test observation', createdAt: '2024-01-01' }
        ],
        tags: ['test', 'memory'],
        metadata: { status: 'active' },
        score: 0.85
      });
    });

    it('should conditionally include graph context', () => {
      // Setup: Results with graph context
      const rawResults = [{
        id: 'mem1',
        name: 'Test',
        type: 'project',
        observationObjects: [],
        tags: [],
        metadata: {},
        ancestors: [{ id: 'anc1', name: 'Ancestor', distance: 1 }],
        descendants: [{ id: 'desc1', name: 'Descendant', distance: 1 }]
      }];

      // Execute with graph context enabled
      const withContext = aggregator.formatSearchResults(rawResults, true);
      
      // Execute with graph context disabled
      const withoutContext = aggregator.formatSearchResults(rawResults, false);

      // Verify: Context inclusion controlled by parameter
      expect(withContext[0].related).toBeDefined();
      expect(withContext[0].related?.ancestors).toHaveLength(1);
      expect(withoutContext[0].related).toBeUndefined();
    });

    it('should handle string and object metadata gracefully', () => {
      // Setup: Mixed metadata types
      const rawResults = [
        {
          id: 'string_meta',
          name: 'String Metadata',
          type: 'project',
          observationObjects: [],
          tags: [],
          metadata: '{"key": "value"}' // String JSON
        },
        {
          id: 'object_meta',
          name: 'Object Metadata',
          type: 'project',
          observationObjects: [],
          tags: [],
          metadata: { key: 'value' } // Object
        },
        {
          id: 'null_meta',
          name: 'Null Metadata',
          type: 'project',
          observationObjects: [],
          tags: [],
          metadata: null // Null
        }
      ];

      // Execute
      const formatted = aggregator.formatSearchResults(rawResults, false);

      // Verify: All metadata types handled
      expect(formatted[0].metadata).toEqual({ key: 'value' });
      expect(formatted[1].metadata).toEqual({ key: 'value' });
      expect(formatted[2].metadata).toEqual({});
    });
  });

  describe('Edge Cases - The Corner Investigations', () => {
    it('should handle empty result sets gracefully', async () => {
      // Execute with empty inputs
      const results = await aggregator.scoreAndRankResults(
        'test',
        [],
        [], [], [], []
      );

      // Verify: Empty results handled
      expect(results).toEqual([]);
    });

    it('should handle results with missing fields', () => {
      // Setup: Incomplete result objects
      const incompleteResults = [
        { id: 'incomplete1' }, // Missing most fields
        { 
          id: 'incomplete2',
          name: 'Partial',
          // Missing type, observations, etc.
        }
      ] as any;

      // Execute
      const formatted = aggregator.formatSearchResults(incompleteResults, false);

      // Verify: Missing fields handled with defaults
      expect(formatted[0].observations).toEqual([]);
      expect(formatted[0].tags).toEqual([]);
      expect(formatted[0].metadata).toEqual({});
      expect(formatted[1].type).toBeUndefined();
    });

    it('should maintain score precision', async () => {
      // Setup: Result that creates fractional score
      const result = {
        id: 'precision',
        name: 'test precision',
        type: 'project',
        observations: [
          { content: 'precision test content', createdAt: '2024-01-01' }
        ],
        tags: [],
        metadata: {}
      };

      // Execute with partial matches
      const results = await aggregator.scoreAndRankResults(
        'precision',
        [result],
        [], ['precision'], [], []
      );

      // Verify: Score precision maintained (account for floating point arithmetic)
      expect(results[0].score).toBeCloseTo(0.35, 1); // 0.25 + 0.1 name bonus
    });
  });
});
