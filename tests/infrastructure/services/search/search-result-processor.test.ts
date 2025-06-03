/**
 * Search Result Processor Tests
 * Single responsibility: Test result scoring and combination logic
 * 
 * THE IMPLEMENTOR'S RULE: Test truth-first scoring hierarchy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchResultProcessor } from '../../../../src/infrastructure/services/search/search-result-processor';
import { TruthScorer, TruthLevel } from '../../../../src/infrastructure/services/search/truth-scorer';
import { QueryType } from '../../../../src/infrastructure/services/search/query-classifier';

describe('SearchResultProcessor - Truth-First Scoring', () => {
  let processor: SearchResultProcessor;
  let mockTruthScorer: TruthScorer;

  beforeEach(() => {
    mockTruthScorer = {
      calculateTruthScore: vi.fn(),
      analyzeMatchEvidence: vi.fn(),
      getMatchReason: vi.fn()
    } as unknown as TruthScorer;

    processor = new SearchResultProcessor(mockTruthScorer);
  });

  describe('Combine and Score', () => {
    it('should prioritize exact candidates over vector candidates', () => {
      const exactCandidates = [
        {
          id: 'exact-1',
          name: 'Exact Match',
          metadata: {},
          matchTypes: { exactMetadata: true, exactName: false, exactContent: false }
        }
      ];

      const vectorCandidates = [
        { id: 'vector-1', score: 0.9 }
      ];

      const queryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        preprocessing: { normalized: 'test' }
      };

      (mockTruthScorer.calculateTruthScore as any).mockReturnValue(0.95);
      (mockTruthScorer.getMatchReason as any).mockReturnValue('exact_metadata');

      const results = processor.combineAndScore(
        exactCandidates,
        vectorCandidates,
        queryIntent,
        0.1
      );

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('exact-1'); // Exact should be first due to higher score
    });

    it('should filter results by threshold', () => {
      const exactCandidates = [
        {
          id: 'low-score',
          name: 'Low Score',
          metadata: {},
          matchTypes: { exactMetadata: false, exactName: false, exactContent: false }
        }
      ];

      const queryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        preprocessing: { normalized: 'test' }
      };

      (mockTruthScorer.calculateTruthScore as any).mockReturnValue(0.05); // Below threshold

      const results = processor.combineAndScore(
        exactCandidates,
        [],
        queryIntent,
        0.1 // Threshold
      );

      expect(results).toHaveLength(0);
    });

    it('should sort results by truth score descending', () => {
      const exactCandidates = [
        {
          id: 'medium',
          name: 'Medium',
          metadata: {},
          matchTypes: { exactMetadata: false, exactName: false, exactContent: false }
        },
        {
          id: 'high',
          name: 'High',
          metadata: {},
          matchTypes: { exactMetadata: true, exactName: false, exactContent: false }
        }
      ];

      const queryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        preprocessing: { normalized: 'test' }
      };

      // Mock different scores for different candidates
      (mockTruthScorer.calculateTruthScore as any)
        .mockReturnValueOnce(0.5) // medium
        .mockReturnValueOnce(0.9); // high

      const results = processor.combineAndScore(
        exactCandidates,
        [],
        queryIntent,
        0.1
      );

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('high'); // Higher score first
      expect(results[1].id).toBe('medium'); // Lower score second
    });
  });

  describe('Match Evidence Creation', () => {
    it('should create proper evidence for exact metadata match', () => {
      const exactCandidate = {
        id: 'test-id',
        name: 'Test Name',
        metadata: { key: 'value' },
        matchTypes: { exactMetadata: true, exactName: false, exactContent: false }
      };

      const queryIntent = {
        type: QueryType.SEMANTIC_SEARCH,
        preprocessing: { normalized: 'test', requiresExactMatch: false }
      };

      (mockTruthScorer.analyzeMatchEvidence as any).mockReturnValue({
        hasExactMetadata: false,
        hasExactName: false,
        hasExactContent: false,
        hasPerfectMatch: false,
        contentMatchBonus: 0,
        namePartialBonus: 0
      });

      (mockTruthScorer.calculateTruthScore as any).mockReturnValue(0.9);
      (mockTruthScorer.getMatchReason as any).mockReturnValue('exact_metadata');

      const results = processor.combineAndScore(
        [exactCandidate],
        [],
        queryIntent,
        0.1
      );

      expect(mockTruthScorer.analyzeMatchEvidence).toHaveBeenCalledWith(
        { name: exactCandidate.name, metadata: exactCandidate.metadata },
        queryIntent.preprocessing.normalized,
        queryIntent.preprocessing.normalized
      );
    });
  });

  describe('Truth Level Determination', () => {
    it('should correctly determine truth levels from scores', () => {
      const testCases = [
        { score: 1.0, expectedLevel: TruthLevel.PERFECT_TRUTH },
        { score: 0.9, expectedLevel: TruthLevel.HIGH_CONFIDENCE },
        { score: 0.85, expectedLevel: TruthLevel.EXACT_NAME },
        { score: 0.8, expectedLevel: TruthLevel.EXACT_CONTENT },
        { score: 0.7, expectedLevel: TruthLevel.SEMANTIC_CAP }
      ];

      testCases.forEach(({ score, expectedLevel }) => {
        const exactCandidate = {
          id: 'test-id',
          name: 'Test',
          metadata: {},
          matchTypes: { exactMetadata: false, exactName: false, exactContent: false }
        };

        const queryIntent = {
          type: QueryType.SEMANTIC_SEARCH,
          preprocessing: { normalized: 'test' }
        };

        (mockTruthScorer.calculateTruthScore as any).mockReturnValue(score);
        (mockTruthScorer.getMatchReason as any).mockReturnValue('test_reason');

        const results = processor.combineAndScore(
          [exactCandidate],
          [],
          queryIntent,
          0.1
        );

        expect(results[0].truthLevel).toBe(expectedLevel);
      });
    });
  });
});
