/**
 * Search Result Processor - Practical Hybrid Scoring Implementation
 * Single responsibility: Combine and score search candidates with interpretable similarity values
 * 
 * GDD v2.3.0: Practical Hybrid approach - semantic scores when available, simulated confidence otherwise
 */

import { QueryIntent } from './query-classifier';
import { TruthScorer, TruthLevel, SearchCandidate, MatchEvidence } from './truth-scorer';
import { ExactMatchCandidate } from './exact-search-channel';
import { VectorCandidate } from './vector-search-channel';
import { EnhancedSearchResult } from '../../../domain/entities/search-config';

export interface PracticalHybridSearchResult extends EnhancedSearchResult {
  score: number;                    // User-interpretable similarity value (0.0-1.0)
  matchType: 'semantic' | 'exact';  // Simple binary classification
  
  // Internal processing fields (development only - not exposed to end users)
  _internal?: {
    truthLevel: TruthLevel;         // Internal ranking logic
    matchReason: string;            // Detailed classification for debugging
    rawVectorScore?: number;        // Original similarity when available
    simulatedScore?: number;        // Derived score for exact matches
  };
}

/**
 * Process and score search results using practical hybrid approach
 * GDD v2.3.0: Truth levels drive ranking, but users see interpretable similarity scores
 */
export class SearchResultProcessor {
  constructor(private truthScorer: TruthScorer) {}

  /**
   * Combine exact and vector candidates with practical hybrid scoring
   */
  combineAndScore(
    exactCandidates: ExactMatchCandidate[],
    vectorCandidates: VectorCandidate[],
    queryIntent: QueryIntent,
    threshold: number
  ): PracticalHybridSearchResult[] {
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
    const scoredResults: PracticalHybridSearchResult[] = [];
    
    for (const candidate of Array.from(candidateMap.values())) {
      const vectorScore = vectorScoreMap.get(candidate.id);
      const hybridResult = this.calculatePracticalHybridScore(
        candidate,
        queryIntent,
        vectorScore
      );

      if (hybridResult.score >= threshold) {
        scoredResults.push({
          id: candidate.id,
          name: candidate.name,
          type: '', // Will be filled by full result retrieval
          observations: [],
          metadata: candidate.metadata,
          score: hybridResult.score,
          matchType: hybridResult.matchType,
          _internal: hybridResult._internal
        });
      }
    }

    // Sort by internal truth level for ranking accuracy, then by score
    return scoredResults.sort((a, b) => {
      const truthA = a._internal?.truthLevel || 0;
      const truthB = b._internal?.truthLevel || 0;
      
      // Primary sort: truth level (higher = better)
      if (truthA !== truthB) {
        return truthB - truthA;
      }
      
      // Secondary sort: user score (higher = better)
      return (b.score || 0) - (a.score || 0);
    });
  }

  /**
   * Calculate practical hybrid score per GDD v2.3.0 specification
   * Returns interpretable similarity values while preserving ranking accuracy
   */
  private calculatePracticalHybridScore(
    candidate: SearchCandidate,
    queryIntent: QueryIntent,
    vectorScore?: number
  ): { score: number; matchType: 'semantic' | 'exact'; _internal: any } {
    
    // Calculate internal truth level for ranking
    const truthScore = this.truthScorer.calculateTruthScore(
      candidate,
      queryIntent.preprocessing.normalized,
      vectorScore
    );
    
    const truthLevel = this.getTruthLevel(truthScore);
    const matchReason = this.truthScorer.getMatchReason(candidate.evidence);
    
    // If we have real vector similarity, use it directly
    if (vectorScore !== undefined && truthLevel <= TruthLevel.SEMANTIC_CAP) {
      return {
        score: vectorScore,           // Raw semantic similarity
        matchType: 'semantic',
        _internal: {
          truthLevel,
          matchReason,
          rawVectorScore: vectorScore
        }
      };
    }
    
    // For exact matches, simulate interpretable confidence scores
    const simulatedScores: Record<TruthLevel, number> = {
      [TruthLevel.PERFECT_TRUTH]: 0.95,    // Very high confidence
      [TruthLevel.HIGH_CONFIDENCE]: 0.90,  // High confidence  
      [TruthLevel.EXACT_NAME]: 0.85,       // Name match confidence
      [TruthLevel.EXACT_CONTENT]: 0.80,    // Content match confidence
      [TruthLevel.SEMANTIC_CAP]: 0.75      // Semantic cap (fallback)
    };
    
    const simulatedScore = simulatedScores[truthLevel];
    
    return {
      score: simulatedScore,
      matchType: 'exact',
      _internal: {
        truthLevel,
        matchReason,
        rawVectorScore: vectorScore,
        simulatedScore
      }
    };
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
   * Determine truth level from score (internal logic)
   */
  private getTruthLevel(score: number): TruthLevel {
    if (score >= TruthLevel.PERFECT_TRUTH) return TruthLevel.PERFECT_TRUTH;
    if (score >= TruthLevel.HIGH_CONFIDENCE) return TruthLevel.HIGH_CONFIDENCE;
    if (score >= TruthLevel.EXACT_NAME) return TruthLevel.EXACT_NAME;
    if (score >= TruthLevel.EXACT_CONTENT) return TruthLevel.EXACT_CONTENT;
    return TruthLevel.SEMANTIC_CAP;
  }
}
