import { SearchConfig } from '../../../domain/entities/search-config';

export enum SearchStrategy {
  WILDCARD = 'wildcard',
  VECTOR_SEMANTIC = 'vector_semantic', 
  METADATA_FULLTEXT = 'metadata_fulltext',
  HYBRID = 'hybrid'
}

export interface SearchStrategyDecision {
  strategy: SearchStrategy;
  shouldUseVector: boolean;
  shouldUseMetadata: boolean;
  shouldUseFulltext: boolean;
}

/**
 * Determines optimal search strategy based on query characteristics
 * Single responsibility: strategy selection
 */
export class SearchStrategyService {
  constructor(private config: SearchConfig) {}

  determineStrategy(query: string): SearchStrategyDecision {
    // Wildcard queries for "all memories" 
    if (this.isWildcardQuery(query)) {
      return {
        strategy: SearchStrategy.WILDCARD,
        shouldUseVector: false,
        shouldUseMetadata: false,
        shouldUseFulltext: false
      };
    }

    // Short queries benefit from vector semantic search
    if (query.length <= 20) {
      return {
        strategy: SearchStrategy.VECTOR_SEMANTIC,
        shouldUseVector: true,
        shouldUseMetadata: true,
        shouldUseFulltext: false
      };
    }

    // Long queries benefit from hybrid approach
    return {
      strategy: SearchStrategy.HYBRID,
      shouldUseVector: true,
      shouldUseMetadata: true,
      shouldUseFulltext: true
    };
  }

  private isWildcardQuery(query: string): boolean {
    const trimmed = query.trim();
    return trimmed === '*' || trimmed === '' || trimmed.toLowerCase() === 'all';
  }
}
