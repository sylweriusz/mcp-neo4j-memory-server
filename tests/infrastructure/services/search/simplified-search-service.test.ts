/**
 * Simplified Search Service Tests - Clean Version
 * Testing search orchestration without technical identifier complexity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimplifiedSearchService } from '../../../../src/infrastructure/services/search/simplified-search-service';
import { QueryClassifier, QueryType, QueryIntent } from '../../../../src/infrastructure/services/search/query-classifier';
import { ExactSearchChannel, ExactMatchCandidate } from '../../../../src/infrastructure/services/search/exact-search-channel';
import { VectorSearchChannel, VectorCandidate } from '../../../../src/infrastructure/services/search/vector-search-channel';
import { WildcardSearchService } from '../../../../src/infrastructure/services/search/wildcard-search-service';

// Mock all the search channels
vi.mock('../../../../src/infrastructure/services/search/query-classifier');
vi.mock('../../../../src/infrastructure/services/search/exact-search-channel');
vi.mock('../../../../src/infrastructure/services/search/vector-search-channel');
vi.mock('../../../../src/infrastructure/services/search/wildcard-search-service');

describe('SimplifiedSearchService', () => {
  let searchService: SimplifiedSearchService;
  let mockSession: any;
  let mockQueryClassifier: any;
  let mockExactChannel: any;
  let mockVectorChannel: any;
  let mockWildcardService: any;

  beforeEach(() => {
    // Mock session
    mockSession = {
      run: vi.fn(),
      close: vi.fn()
    };

    // Mock search channels
    mockQueryClassifier = { classify: vi.fn() };
    mockExactChannel = { search: vi.fn() };
    mockVectorChannel = { search: vi.fn() };
    mockWildcardService = { search: vi.fn() };

    // Set up constructor mocks
    (QueryClassifier as any).mockImplementation(() => mockQueryClassifier);
    (ExactSearchChannel as any).mockImplementation(() => mockExactChannel);
    (VectorSearchChannel as any).mockImplementation(() => mockVectorChannel);
    (WildcardSearchService as any).mockImplementation(() => mockWildcardService);

    searchService = new SimplifiedSearchService(mockSession);
  });

  describe('Input Validation', () => {
    it('should throw error for empty query', async () => {
      await expect(searchService.search(''))
        .rejects.toThrow('Search query must be a non-empty string');
    });

    it('should throw error for negative limit', async () => {
      await expect(searchService.search('test', -1))
        .rejects.toThrow('Search limit must be positive');
    });
  });

  describe('Wildcard Search', () => {
    it('should execute wildcard search for asterisk query', async () => {
      const queryIntent: QueryIntent = {
        type: QueryType.WILDCARD,
        confidence: 1.0,
        preprocessing: { normalized: '*' }
      };

      const wildcardResults = [
        {
          id: 'wild-1',
          name: 'Wildcard Result',
          type: 'test',
          observations: [],
          metadata: {},
          score: 1.0
        }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockWildcardService.search.mockResolvedValue(wildcardResults);

      const results = await searchService.search('*', 10, true);

      expect(mockWildcardService.search).toHaveBeenCalledWith(10, true, undefined);
      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('exact');
    });
  });

  describe('Multi-Channel Search', () => {
    it('should execute exact and vector search for semantic queries', async () => {
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: { normalized: 'test query' }
      };

      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'exact-1',
          name: 'Exact Match',
          metadata: {},
          matchTypes: { exactName: true, exactMetadata: false, exactContent: false }
        }
      ];

      const vectorCandidates: VectorCandidate[] = [{ id: 'vector-1', score: 0.85 }];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockVectorChannel.search.mockResolvedValue(vectorCandidates);
      
      // Mock enrichment
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              const data: any = {
                'exact-1': { id: 'exact-1', name: 'Exact Match', type: 'test' },
                'vector-1': { id: 'vector-1', name: 'Vector Match', type: 'test' }
              };
              return data[field] || null;
            }
          }
        ]
      });

      const results = await searchService.search('test query');

      expect(mockExactChannel.search).toHaveBeenCalled();
      expect(mockVectorChannel.search).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
