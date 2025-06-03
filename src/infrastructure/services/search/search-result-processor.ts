/**
 * Search Result Processor - Truth-First Scoring Logic
 * Single responsibility: Combine and score search candidates
 * 
 * THE IMPLEMENTOR'S RULE: Separate scoring logic for testability
 */

import { QueryIntent } from './query-classifier';
import { TruthScorer, TruthLevel, SearchCandidate, MatchEvidence } from './truth-scorer';
import { ExactMatchCandidate } from './exact-search-channel';
import { VectorCandidate } from './vector-search-channel';
import { EnhancedSearchResult } from '../../../domain/entities/search-config';

export interface TruthSearchResult extends EnhancedSearchResult {
  truthLevel: TruthLevel;
  matchReason: string;
  rawVectorScore?: number;
}

/**
 * Process and score search results using truth-first hierarchy
 * Zero fallback architecture - explicit scoring decisions
 */
export class SearchResultProcessor {
  constructor(private truthScorer: TruthScorer) {}

  /**
   * Combine exact and vector candidates with truth-first scoring
   */
  combineAndScore(
    exactCandidates: ExactMatchCandidate[],
    vectorCandidates: VectorCandidate[],
    queryIntent: QueryIntent,
    threshold: number
  ): TruthSearchResult[] {
    // Create candidate map for efficient lookup
    const candidateMap = new Map<string, SearchCandidate>();
    const vectorScoreMap = new Map<string, number>();

    // Process exact candidates
    for (const exact of exactCandidates) {
      const evidence = this.createMatchEvidence(exact, queryIntent);
      candidateMap.set(exact.id, {
        id: exact.id,
        name: exact.name,
        metadata: exact.metadata,
        evidence
      });
    }

    // Process vector candidates
    for (const vector of vectorCandidates) {
      vectorScoreMap.set(vector.id, vector.score);
      
      // If not already in exact candidates, add with minimal evidence
      if (!candidateMap.has(vector.id)) {
        candidateMap.set(vector.id, {
          id: vector.id,
          name: '', // Will be filled by full result retrieval
          metadata: {},
          evidence: this.createMinimalEvidence()
        });
      }
    }

    // Score all candidates and filter by threshold
    const scoredResults: TruthSearchResult[] = [];
    
    for (const candidate of candidateMap.values()) {
      const vectorScore = vectorScoreMap.get(candidate.id);
      const truthScore = this.truthScorer.calculateTruthScore(
        candidate,
        queryIntent.preprocessing.normalized,
        vectorScore
      );

      if (truthScore >= threshold) {
        scoredResults.push({
          id: candidate.id,
          name: candidate.name,
          type: '', // Will be filled by full result retrieval
          observations: [],
          metadata: candidate.metadata,
          score: truthScore,
          truthLevel: this.getTruthLevel(truthScore),
          matchReason: this.truthScorer.getMatchReason(candidate.evidence),
          rawVectorScore: vectorScore
        });
      }
    }

    // Sort by truth score (descending)
    return scoredResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Create match evidence from exact search results
   */
  private createMatchEvidence(
    exact: ExactMatchCandidate,
    queryIntent: QueryIntent
  ): MatchEvidence {
    const baseEvidence = this.truthScorer.analyzeMatchEvidence(
      { name: exact.name, metadata: exact.metadata },
      queryIntent.preprocessing.normalized,
      queryIntent.preprocessing.normalized
    );

    return {
      ...baseEvidence,
      hasExactMetadata: exact.matchTypes.exactMetadata,
      hasExactName: exact.matchTypes.exactName,
      hasExactContent: exact.matchTypes.exactContent,
      hasPerfectMatch: 
        (exact.matchTypes.exactMetadata && queryIntent.preprocessing.normalized.length > 10) ||
        (exact.matchTypes.exactName && exact.name.toLowerCase() === queryIntent.preprocessing.normalized)
    };
  }

  /**
   * Create minimal evidence for vector-only candidates
   */
  private createMinimalEvidence(): MatchEvidence {
    return {
      hasExactMetadata: false,
      hasExactName: false,
      hasExactContent: false,
      hasPerfectMatch: false,
      contentMatchBonus: 0,
      namePartialBonus: 0
    };
  }

  /**
   * Determine truth level from score
   */
  private getTruthLevel(score: number): TruthLevel {
    if (score >= TruthLevel.PERFECT_TRUTH) return TruthLevel.PERFECT_TRUTH;
    if (score >= TruthLevel.HIGH_CONFIDENCE) return TruthLevel.HIGH_CONFIDENCE;
    if (score >= TruthLevel.EXACT_NAME) return TruthLevel.EXACT_NAME;
    if (score >= TruthLevel.EXACT_CONTENT) return TruthLevel.EXACT_CONTENT;
    return TruthLevel.SEMANTIC_CAP;
  }
}
