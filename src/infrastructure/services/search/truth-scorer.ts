/**
 * Truth Level System - GDD v2.2.0 Compliance
 * Single responsibility: Truth hierarchy scoring and classification
 * 
 * THE IMPLEMENTOR'S RULE: Perfect truth always wins over approximations
 */

export enum TruthLevel {
  PERFECT_TRUTH = 1.0,      // Exact metadata + long query OR exact name match
  HIGH_CONFIDENCE = 0.9,    // Exact metadata match
  EXACT_NAME = 0.85,        // Exact name match
  EXACT_CONTENT = 0.8,      // Exact observation content match
  SEMANTIC_CAP = 0.75       // Maximum for semantic similarity
}

export interface MatchEvidence {
  hasExactMetadata: boolean;
  hasExactName: boolean;
  hasExactContent: boolean;
  hasPerfectMatch: boolean;
  contentMatchBonus: number;
  namePartialBonus: number;
}

export interface SearchCandidate {
  id: string;
  name: string;
  metadata: Record<string, any>;
  evidence: MatchEvidence;
}

/**
 * Truth-first scoring system that prioritizes exact matches over semantic similarity
 * Zero fallback architecture - no approximations when exact matches exist
 */
export class TruthScorer {
  
  /**
   * Calculate truth score according to GDD v2.2.0 hierarchy
   * Perfect truth always wins, semantic scores capped at 0.75
   */
  calculateTruthScore(
    candidate: SearchCandidate,
    query: string,
    vectorScore?: number
  ): number {
    const evidence = candidate.evidence;
    
    // Perfect truth detection - always wins
    if (evidence.hasPerfectMatch) {
      return TruthLevel.PERFECT_TRUTH;
    }
    
    // High confidence exact matches
    if (evidence.hasExactMetadata) {
      return TruthLevel.HIGH_CONFIDENCE;
    }
    
    if (evidence.hasExactName) {
      return TruthLevel.EXACT_NAME;
    }
    
    if (evidence.hasExactContent) {
      return TruthLevel.EXACT_CONTENT;
    }
    
    // Semantic scoring (capped at SEMANTIC_CAP)
    const semanticBase = (vectorScore || 0) * 0.55;
    const contentBonus = evidence.contentMatchBonus * 0.25;
    const nameBonus = evidence.namePartialBonus * 0.20;
    
    const semanticScore = semanticBase + contentBonus + nameBonus;
    
    // Enforce semantic cap to preserve exact match supremacy
    return Math.min(semanticScore, TruthLevel.SEMANTIC_CAP);
  }

  /**
   * Analyze match evidence for a candidate against normalized query
   * Case-insensitive comparison with perfect match detection
   */
  analyzeMatchEvidence(
    candidate: { name: string; metadata: Record<string, any> },
    normalizedQuery: string,
    originalQuery: string
  ): MatchEvidence {
    const candidateName = candidate.name.toLowerCase();
    const metadataString = JSON.stringify(candidate.metadata).toLowerCase();
    
    // Exact match detection
    const hasExactMetadata = metadataString.includes(normalizedQuery);
    const hasExactName = candidateName.includes(normalizedQuery);
    
    // Perfect truth conditions (GDD v2.2.0)
    const hasPerfectMatch = 
      (hasExactMetadata && originalQuery.length > 10) ||
      (candidateName === normalizedQuery);
    
    // Partial match bonuses for semantic scoring
    const namePartialBonus = this.calculateNameMatchBonus(candidateName, normalizedQuery);
    
    return {
      hasExactMetadata,
      hasExactName,
      hasExactContent: false, // Will be set by observation analysis
      hasPerfectMatch,
      contentMatchBonus: 0, // Will be set by observation analysis
      namePartialBonus
    };
  }

  /**
   * Calculate name match bonus for semantic scoring
   * Exact matches get higher bonuses, partial matches get smaller bonuses
   */
  private calculateNameMatchBonus(name: string, query: string): number {
    if (name === query) return 0.2;      // Exact match
    if (name.includes(query)) return 0.1; // Contains match
    
    // Word boundary matching for compound terms
    const queryWords = query.split(/\s+/);
    const nameWords = name.split(/\s+/);
    
    let wordMatches = 0;
    for (const queryWord of queryWords) {
      if (nameWords.some(nameWord => nameWord.includes(queryWord))) {
        wordMatches++;
      }
    }
    
    return wordMatches > 0 ? (wordMatches / queryWords.length) * 0.05 : 0;
  }

  /**
   * Get match reason for debugging and transparency
   * Helps understand why a particular score was assigned
   */
  getMatchReason(evidence: MatchEvidence): string {
    if (evidence.hasPerfectMatch) return 'perfect_truth';
    if (evidence.hasExactMetadata) return 'exact_metadata';
    if (evidence.hasExactName) return 'exact_name';
    if (evidence.hasExactContent) return 'exact_content';
    return 'semantic';
  }

  /**
   * Validate truth level for debugging
   * Ensures scoring follows GDD v2.2.0 hierarchy
   */
  validateTruthLevel(score: number, evidence: MatchEvidence): boolean {
    // Perfect truth must score 1.0
    if (evidence.hasPerfectMatch && score !== TruthLevel.PERFECT_TRUTH) {
      return false;
    }
    
    // Semantic scores must be capped
    if (!evidence.hasExactMetadata && !evidence.hasExactName && 
        !evidence.hasExactContent && score > TruthLevel.SEMANTIC_CAP) {
      return false;
    }
    
    return true;
  }
}
