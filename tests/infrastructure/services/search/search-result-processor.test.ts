/**
 * SearchResultProcessor Tests - Practical Hybrid Scoring
 * Single responsibility: Test practical hybrid score calculation (GDD v2.3.0)
 * 
 * Test Coverage Target: 90%+ (Critical scoring component)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchResultProcessor, PracticalHybridSearchResult } from '../../../../src/infrastructure/services/search/search-result-processor';
import { TruthScorer, TruthLevel } from '../../../../src/infrastructure/services/search/truth-scorer';
import { QueryClassifier, QueryIntent, QueryType } from '../../../../src/infrastructure/services/search/query-classifier';
import { ExactMatchCandidate } from '../../../../src/infrastructure/services/search/exact-search-channel';
import { VectorCandidate } from '../../../../src/infrastructure/services/search/vector-search-channel';

describe('SearchResultProcessor - Practical Hybrid Scoring', () => {
  let processor: SearchResultProcessor;
  let mockTruthScorer: vi.Mocked<TruthScorer>;
  let queryIntent: QueryIntent;

  beforeEach(() => {
    mockTruthScorer = {
      calculateTruthScore: vi.fn(),
      analyzeMatchEvidence: vi.fn(),
      getMatchReason: vi.fn(),
      validateTruthLevel: vi.fn()
    };
    processor = new SearchResultProcessor(mockTruthScorer);
    
    // Standard query intent
    queryIntent = {
      type: QueryType.SEMANTIC_SEARCH,
      confidence: 0.8,
      preprocessing: {
        normalized: 'test query',
        isSpecialPattern: false,
        requiresExactMatch: false
      }
    };
  });

  describe('Practical Hybrid Score Calculation (GDD v2.3.0)', () => {
    it('should use raw vector similarity for semantic matches', () => {
      const exactCandidates: ExactMatchCandidate[] = [];
      const vectorCandidates: VectorCandidate[] = [
        { id: 'test-1', score: 0.85 }
      ];

      // Mock truth scorer to return semantic score within cap
      mockTruthScorer.calculateTruthScore.mockReturnValue(0.46); // 0.85 * 0.55 = 0.4675
      mockTruthScorer.analyzeMatchEvidence.mockReturnValue({
        hasExactMetadata: false,
        hasExactName: false,
        hasExactContent: false,
        hasPerfectMatch: false,
        contentMatchBonus: 0,
        namePartialBonus: 0
      });
      mockTruthScorer.getMatchReason.mockReturnValue('semantic');

      const results = processor.combineAndScore(
        exactCandidates,
        vectorCandidates,
        queryIntent,
        0.1
      );

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.85); // Raw vector similarity
      expect(results[0].matchType).toBe('semantic');
    });

    it('should simulate confidence scores for exact matches', () => {
      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'test-1',
          name: 'Test Memory',
          metadata: { description: 'test' },
          matchTypes: {
            exactMetadata: false,
            exactName: true,
            exactContent: false
          }
        }
      ];
      const vectorCandidates: VectorCandidate[] = [];

      // Mock exact name match
      mockTruthScorer.calculateTruthScore.mockReturnValue(TruthLevel.EXACT_NAME);
      mockTruthScorer.analyzeMatchEvidence.mockReturnValue({
        hasExactMetadata: false,
        hasExactName: true,
        hasExactContent: false,
        hasPerfectMatch: false,
        contentMatchBonus: 0,
        namePartialBonus: 0
      });
      mockTruthScorer.getMatchReason.mockReturnValue('exact_name');

      const results = processor.combineAndScore(
        exactCandidates,
        vectorCandidates,
        queryIntent,
        0.1
      );

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.85); // Simulated EXACT_NAME confidence
      expect(results[0].matchType).toBe('exact');
      expect(results[0]._internal?.truthLevel).toBe(TruthLevel.EXACT_NAME);
    });

    it('should prioritize perfect truth matches with highest simulated scores', () => {
      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'test-1',
          name: 'Test Memory',
          metadata: { longDescription: 'very long detailed description matching query' },
          matchTypes: {
            exactMetadata: true,
            exactName: false,
            exactContent: false
          }
        }
      ];
      const vectorCandidates: VectorCandidate[] = [];

      // Mock perfect truth (long query + exact metadata)
      mockTruthScorer.calculateTruthScore.mockReturnValue(TruthLevel.PERFECT_TRUTH);
      mockTruthScorer.analyzeMatchEvidence.mockReturnValue({
        hasExactMetadata: true,
        hasExactName: false,
        hasExactContent: false,
        hasPerfectMatch: true, // Perfect truth condition
        contentMatchBonus: 0,
        namePartialBonus: 0
      });
      mockTruthScorer.getMatchReason.mockReturnValue('perfect_truth');

      const results = processor.combineAndScore(
        exactCandidates,
        vectorCandidates,
        queryIntent,
        0.1
      );

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95); // Highest simulated confidence
      expect(results[0].matchType).toBe('exact');
      expect(results[0]._internal?.truthLevel).toBe(TruthLevel.PERFECT_TRUTH);
    });
  });

  describe('Candidate Combination Logic', () => {
    it('should combine exact and vector candidates without duplication', () => {
      const exactCandidates: ExactMatchCandidate[] = [
        {
          id: 'test-1',
          name: 'Memory One',
          metadata: { type: 'exact' },
          matchTypes: { exactMetadata: true, exactName: false, exactContent: false }
        }
      ];
      const vectorCandidates: VectorCandidate[] = [
        { id: 'test-1', score: 0.7 }, // Same ID as exact
        { id: 'test-2', score: 0.6 }  // Different ID
      ];

      mockTruthScorer.calculateTruthScore
        .mockReturnValueOnce(TruthLevel.HIGH_CONFIDENCE) // test-1 exact match
        .mockReturnValueOnce(0.33); // test-2 semantic (0.6 * 0.55)

      mockTruthScorer.analyzeMatchEvidence
        .mockReturnValueOnce({
          hasExactMetadata: true,
          hasExactName: false,
          hasExactContent: false,
          hasPerfectMatch: false,
          contentMatchBonus: 0,
          namePartialBonus: 0
        })
        .mockReturnValueOnce({
          hasExactMetadata: false,
          hasExactName: false,
          hasExactContent: false,
          hasPerfectMatch: false,
          contentMatchBonus: 0,
          namePartialBonus: 0
        });

      mockTruthScorer.getMatchReason
        .mockReturnValueOnce('exact_metadata')
        .mockReturnValueOnce('semantic');

      const results = processor.combineAndScore(
        exactCandidates,
        vectorCandidates,
        queryIntent,
        0.1
      );

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('test-1'); // Exact match should rank first
      expect(results[1].id).toBe('test-2'); // Vector-only second
    });
  });

  describe('Threshold Filtering', () => {
    it('should filter candidates below threshold', () => {
      const exactCandidates: ExactMatchCandidate[] = [];
      const vectorCandidates: VectorCandidate[] = [
        { id: 'test-1', score: 0.8 },  // Above threshold (0.44 after scaling)
        { id: 'test-2', score: 0.1 }   // Below threshold (0.055 after scaling)
      ];

      mockTruthScorer.calculateTruthScore
        .mockReturnValueOnce(0.44) // 0.8 * 0.55 = 0.44 (above 0.3 threshold)
        .mockReturnValueOnce(0.055); // 0.1 * 0.55 = 0.055 (below 0.3 threshold)

      mockTruthScorer.analyzeMatchEvidence.mockReturnValue({
        hasExactMetadata: false,
        hasExactName: false,
        hasExactContent: false,
        hasPerfectMatch: false,
        contentMatchBonus: 0,
        namePartialBonus: 0
      });

      const results = processor.combineAndScore(
        exactCandidates,
        vectorCandidates,
        queryIntent,
        0.3 // High threshold
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test-1');
    });
  });
});
