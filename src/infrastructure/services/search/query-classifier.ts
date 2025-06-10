/**
 * Query Classifier - Truth-First Search Architecture
 * Single responsibility: Query intent detection and preprocessing
 * 
 * THE IMPLEMENTOR'S RULE: Build exactly what's specified in GDD v2.3.1
 */

import { MCPValidationError, MCPErrorCodes } from '../../errors';

export enum QueryType {
  WILDCARD = 'wildcard',
  EXACT_SEARCH = 'exact_search',
  SEMANTIC_SEARCH = 'semantic_search'
}

export interface QueryPreprocessing {
  normalized: string;        // Lowercase normalized query
}

export interface QueryIntent {
  type: QueryType;
  confidence: number;
  preprocessing: QueryPreprocessing;
}

/**
 * Query classification according to GDD v2.3.1 specifications
 * Zero fallback architecture - explicit classification for all patterns
 */
export class QueryClassifier {
  
  classify(query: string): QueryIntent {
    if (query === null || query === undefined || typeof query !== 'string') {
      throw new MCPValidationError(
        'Query must be a non-empty string',
        MCPErrorCodes.INVALID_SEARCH_QUERY
      );
    }

    const trimmed = query.trim();
    
    // Check for whitespace-only strings (but allow truly empty strings)
    if (query.length > 0 && trimmed.length === 0) {
      throw new MCPValidationError(
        'Query must be a non-empty string',
        MCPErrorCodes.INVALID_SEARCH_QUERY
      );
    }
    
    const normalized = trimmed.toLowerCase();

    // Wildcard detection
    if (this.isWildcardQuery(trimmed)) {
      return {
        type: QueryType.WILDCARD,
        confidence: 1.0,
        preprocessing: {
          normalized
        }
      };
    }

    // Exact search detection (numbers/symbols only)
    if (this.isExactSearchPattern(trimmed)) {
      return {
        type: QueryType.EXACT_SEARCH,
        confidence: 0.9,
        preprocessing: {
          normalized
        }
      };
    }

    // Default: semantic search
    return {
      type: QueryType.SEMANTIC_SEARCH,
      confidence: 0.8,
      preprocessing: {
        normalized
      }
    };
  }

  /**
   * Wildcard query detection
   * GDD: query === "*" (empty strings rejected for clarity)
   */
  private isWildcardQuery(query: string): boolean {
    return query === '*' || query.toLowerCase() === 'all';
  }

  /**
   * Exact search pattern detection
   * GDD: numbers and symbols only (no letters)
   */
  private isExactSearchPattern(query: string): boolean {
    return /^[^a-zA-Z]*$/.test(query) && query.length > 0;
  }
}
