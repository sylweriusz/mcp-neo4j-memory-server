/**
 * Simplified Search Service Tests - Production Coverage
 * Single responsibility: Test search orchestration with transparent scoring
 * 
 * THE IMPLEMENTOR'S RULE: Test production paths with minimal mocking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimplifiedSearchService, SimpleSearchResult } from '../../../../src/infrastructure/services/search/simplified-search-service';
import { QueryClassifier, QueryType, QueryIntent } from '../../../../src/infrastructure/services/search/query-classifier';
import { ExactSearchChannel, ExactMatchCandidate } from '../../../../src/infrastructure/services/search/exact-search-channel';
import { VectorSearchChannel, VectorCandidate } from '../../../../src/infrastructure/services/search/vector-search-channel';
import { WildcardSearchService } from '../../../../src/infrastructure/services/search/wildcard-search-service';

// Mock all the search channels
vi.mock('../../../../src/infrastructure/services/search/query-classifier');
vi.mock('../../../../src/infrastructure/services/search/exact-search-channel');
vi.mock('../../../../src/infrastructure/services/search/vector-search-channel');
vi.mock('../../../../src/infrastructure/services/search/wildcard-search-service');

describe('SimplifiedSearchService - Production Coverage', () => {
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
    mockQueryClassifier = {
      classify: vi.fn()
    };

    mockExactChannel = {
      search: vi.fn()
    };

    mockVectorChannel = {
      search: vi.fn()
    };

    mockWildcardService = {
      search: vi.fn()
    };

    // Set up constructor mocks
    (QueryClassifier as any).mockImplementation(() => mockQueryClassifier);
    (ExactSearchChannel as any).mockImplementation(() => mockExactChannel);
    (VectorSearchChannel as any).mockImplementation(() => mockVectorChannel);
    (WildcardSearchService as any).mockImplementation(() => mockWildcardService);

    searchService = new SimplifiedSearchService(mockSession);
  });

  describe('Input Validation', () => {
    it('should throw error for empty query', async () => {
      // Act & Assert
      await expect(searchService.search(''))
        .rejects.toThrow('Search query must be a non-empty string');
    });

    it('should throw error for null query', async () => {
      // Act & Assert
      await expect(searchService.search(null as any))
        .rejects.toThrow('Search query must be a non-empty string');
    });

    it('should throw error for non-string query', async () => {
      // Act & Assert
      await expect(searchService.search(123 as any))
        .rejects.toThrow('Search query must be a non-empty string');
    });

    it('should throw error for negative limit', async () => {
      // Act & Assert
      await expect(searchService.search('test', -1))
        .rejects.toThrow('Search limit must be positive');
    });

    it('should throw error for zero limit', async () => {
      // Act & Assert
      await expect(searchService.search('test', 0))
        .rejects.toThrow('Search limit must be positive');
    });
  });

  describe('Wildcard Search', () => {
    it('should execute wildcard search for asterisk query', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.WILDCARD,
        confidence: 1.0,
        preprocessing: {
          normalized: '*',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
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

      // Act
      const results = await searchService.search('*', 10, true);

      // Assert
      expect(mockQueryClassifier.classify).toHaveBeenCalledWith('*');
      expect(mockWildcardService.search).toHaveBeenCalledWith(10, true, undefined);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(1.0);
      expect(results[0].matchType).toBe('exact');
    });

    it('should pass memory types to wildcard search', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.WILDCARD,
        confidence: 1.0,
        preprocessing: {
          normalized: '*',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockWildcardService.search.mockResolvedValue([]);

      // Act
      await searchService.search('*', 5, false, ['project', 'task']);

      // Assert
      expect(mockWildcardService.search).toHaveBeenCalledWith(5, false, ['project', 'task']);
    });
  });

  describe('Multi-Channel Search', () => {
    it('should execute exact and vector search for semantic queries', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'test query',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'exact-1',
          name: 'Exact Match',
          metadata: {},
          matchTypes: {
            exactName: true,
            exactMetadata: false,
            exactContent: false
          }
        }
      ];

      const vectorCandidates: VectorCandidate[] = [
        {
          id: 'vector-1',
          score: 0.85
        }
      ];

      // Mock database query for result enrichment
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'exact-1';
                case 'name': return 'Exact Match';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          },
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'vector-1';
                case 'name': return 'Vector Match';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          }
        ]
      });

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockVectorChannel.search.mockResolvedValue(vectorCandidates);

      // Act
      const results = await searchService.search('test query', 10, true, ['test'], 0.1);

      // Assert
      expect(mockExactChannel.search).toHaveBeenCalledWith('test query', 20, ['test']);
      expect(mockVectorChannel.search).toHaveBeenCalledWith('test query', 20, 0.1, ['test']);
      expect(results).toHaveLength(2);
    });

    it('should skip vector search for technical identifier queries', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.95,
        preprocessing: {
          normalized: 'uuid-12345',
          isSpecialPattern: true,
          requiresExactMatch: true
        }
      };

      const exactCandidates: ExactMatchCandidate[] = [];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockSession.run.mockResolvedValue({ records: [] });

      // Act
      const results = await searchService.search('uuid-12345');

      // Assert
      expect(mockExactChannel.search).toHaveBeenCalled();
      expect(mockVectorChannel.search).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it('should handle vector search failure gracefully', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'failing query',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'exact-only',
          name: 'Exact Only',
          metadata: {},
          matchTypes: {
            exactName: true,
            exactMetadata: false,
            exactContent: false
          }
        }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockVectorChannel.search.mockRejectedValue(new Error('Vector search failed'));
      
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'exact-only';
                case 'name': return 'Exact Only';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          }
        ]
      });

      // Act
      const results = await searchService.search('failing query');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('exact-only');
    });
  });

  describe('Score Calculation', () => {
    it('should calculate exact match scores correctly', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'scoring test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'exact-high',
          name: 'High Score Match',
          metadata: {},
          matchTypes: {
            exactName: true,
            exactMetadata: false,
            exactContent: false
          }
        }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockVectorChannel.search.mockResolvedValue([]);
      
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'exact-high';
                case 'name': return 'High Score Match';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          }
        ]
      });

      // Act
      const results = await searchService.search('scoring test');

      // Assert
      expect(results[0].matchType).toBe('exact');
      expect(results[0].score).toBeGreaterThan(0.8); // Exact matches get high scores
    });

    it('should calculate vector match scores correctly', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'vector test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const vectorCandidates: VectorCandidate[] = [
        {
          id: 'vector-match',
          score: 0.75
        }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue([]);
      mockVectorChannel.search.mockResolvedValue(vectorCandidates);
      
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'vector-match';
                case 'name': return 'Vector Match';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          }
        ]
      });

      // Act
      const results = await searchService.search('vector test');

      // Assert
      expect(results[0].matchType).toBe('semantic');
      expect(results[0].score).toBe(0.75); // Vector score preserved
    });

    it('should combine exact and vector scores', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'combined test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'combined-match',
          name: 'Combined Match',
          metadata: {},
          matchTypes: {
            exactName: true,
            exactMetadata: false,
            exactContent: false
          }
        }
      ];

      const vectorCandidates: VectorCandidate[] = [
        {
          id: 'combined-match',
          score: 0.9
        }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockVectorChannel.search.mockResolvedValue(vectorCandidates);
      
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'combined-match';
                case 'name': return 'Combined Match';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          }
        ]
      });

      // Act
      const results = await searchService.search('combined test');

      // Assert
      expect(results[0].matchType).toBe('exact'); // Exact match takes precedence
      expect(results[0].score).toBeGreaterThan(0.85); // Boosted by vector score
    });

    it('should filter results by threshold', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'threshold test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const vectorCandidates: VectorCandidate[] = [
        { id: 'high-score', score: 0.8 },
        { id: 'low-score', score: 0.3 }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue([]);
      mockVectorChannel.search.mockResolvedValue(vectorCandidates);
      
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'high-score';
                case 'name': return 'High Score Match';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          }
        ]
      });

      // Act
      const results = await searchService.search('threshold test', 10, true, undefined, 0.5);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('high-score');
    });

    it('should apply result limit correctly', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'limit test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const vectorCandidates: VectorCandidate[] = [
        { id: 'result-1', score: 0.9 },
        { id: 'result-2', score: 0.8 },
        { id: 'result-3', score: 0.7 }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue([]);
      mockVectorChannel.search.mockResolvedValue(vectorCandidates);
      
      mockSession.run.mockResolvedValue({
        records: vectorCandidates.slice(0, 2).map(candidate => ({
          get: (field: string) => {
            switch (field) {
              case 'id': return candidate.id;
              case 'name': return `Match ${candidate.id}`;
              case 'type': return 'test';
              case 'metadata': return '{}';
              case 'observations': return [];
              case 'ancestors': return [];
              case 'descendants': return [];
              default: return null;
            }
          }
        }))
      });

      // Act
      const results = await searchService.search('limit test', 2);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('result-1');
      expect(results[1].id).toBe('result-2');
    });
  });

  describe('Result Enrichment', () => {
    it('should handle database enrichment errors gracefully', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'enrichment test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'enrich-test',
          name: 'Enrichment Test',
          metadata: {},
          matchTypes: {
            exactName: true,
            exactMetadata: false,
            exactContent: false
          }
        }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockVectorChannel.search.mockResolvedValue([]);
      mockSession.run.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(searchService.search('enrichment test')).rejects.toThrow('Database error');
    });

    it('should handle empty enrichment results', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'empty test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'missing-memory',
          name: 'Missing Memory',
          metadata: {},
          matchTypes: {
            exactName: true,
            exactMetadata: false,
            exactContent: false
          }
        }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue(exactCandidates);
      mockVectorChannel.search.mockResolvedValue([]);
      mockSession.run.mockResolvedValue({ records: [] }); // No enrichment data

      // Act
      const results = await searchService.search('empty test');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('missing-memory');
      expect(results[0].name).toBe('Unknown Memory missing-memory');
    });

    it('should preserve result ordering', async () => {
      // Arrange
      const queryIntent: QueryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        confidence: 0.8,
        preprocessing: {
          normalized: 'order test',
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };

      const vectorCandidates: VectorCandidate[] = [
        { id: 'second', score: 0.8 },
        { id: 'first', score: 0.9 }
      ];

      mockQueryClassifier.classify.mockReturnValue(queryIntent);
      mockExactChannel.search.mockResolvedValue([]);
      mockVectorChannel.search.mockResolvedValue(vectorCandidates);
      
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'first';
                case 'name': return 'First Result';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          },
          {
            get: (field: string) => {
              switch (field) {
                case 'id': return 'second';
                case 'name': return 'Second Result';
                case 'type': return 'test';
                case 'metadata': return '{}';
                case 'observations': return [];
                case 'ancestors': return [];
                case 'descendants': return [];
                default: return null;
              }
            }
          }
        ]
      });

      // Act
      const results = await searchService.search('order test');

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('first'); // Higher score should be first
      expect(results[1].id).toBe('second');
    });
  });
});
