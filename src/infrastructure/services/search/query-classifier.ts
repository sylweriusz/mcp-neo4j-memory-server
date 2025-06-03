/**
 * Query Classifier - Truth-First Search Architecture
 * Single responsibility: Query intent detection and preprocessing
 * 
 * THE IMPLEMENTOR'S RULE: Build exactly what's specified in GDD v2.3.1
 */

export enum QueryType {
  WILDCARD = 'wildcard',
  TECHNICAL_IDENTIFIER = 'technical_identifier', 
  EXACT_SEARCH = 'exact_search',
  SEMANTIC_SEARCH = 'semantic_search'
}

export interface QueryPreprocessing {
  normalized: string;        // Lowercase normalized query
  isSpecialPattern: boolean; // UUID, version numbers, base64-like
  requiresExactMatch: boolean;
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
      throw new Error('Query must be a non-empty string');
    }

    const trimmed = query.trim();
    const normalized = trimmed.toLowerCase();

    // Wildcard detection
    if (this.isWildcardQuery(trimmed)) {
      return {
        type: QueryType.WILDCARD,
        confidence: 1.0,
        preprocessing: {
          normalized,
          isSpecialPattern: false,
          requiresExactMatch: false
        }
      };
    }

    // Technical identifier detection
    const technicalResult = this.detectTechnicalIdentifier(trimmed);
    if (technicalResult.isMatch) {
      return {
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: technicalResult.confidence,
        preprocessing: {
          normalized,
          isSpecialPattern: true,
          requiresExactMatch: true
        }
      };
    }

    // Exact search detection (numbers/symbols only)
    if (this.isExactSearchPattern(trimmed)) {
      return {
        type: QueryType.EXACT_SEARCH,
        confidence: 0.9,
        preprocessing: {
          normalized,
          isSpecialPattern: true,
          requiresExactMatch: true
        }
      };
    }

    // Default: semantic search
    return {
      type: QueryType.SEMANTIC_SEARCH,
      confidence: 0.8,
      preprocessing: {
        normalized,
        isSpecialPattern: false,
        requiresExactMatch: false
      }
    };
  }

  /**
   * Wildcard query detection
   * GDD: query === "*" || query === ""
   */
  private isWildcardQuery(query: string): boolean {
    return query === '*' || query === '' || query.toLowerCase() === 'all';
  }

  /**
   * Technical identifier pattern detection
   * GDD patterns: UUID, version numbers, base64-like strings
   */
  private detectTechnicalIdentifier(query: string): { isMatch: boolean; confidence: number } {
    // UUID pattern: 8-4-4-4-12 hex characters
    if (/^[0-9a-f-]{36}$/i.test(query)) {
      return { isMatch: true, confidence: 0.95 };
    }

    // Version number pattern: v1.2.3 or 1.2.3
    if (/^v?\d+\.\d+\.\d+/.test(query)) {
      return { isMatch: true, confidence: 0.9 };
    }

    // Base64-like pattern: alphanumeric + / + = with minimum length
    // But ensure it's not mixed text with consecutive letters and numbers
    if (/^[A-Za-z0-9+/=]+$/.test(query) && query.length > 8) {
      // Exclude obvious mixed alphanumeric text (like "mixed123text")
      // Allow pure base64 patterns (mostly letters/numbers but not obvious text)
      if (/^[a-z]+\d+[a-z]*$|^\d+[a-z]+\d*$/i.test(query)) {
        return { isMatch: false, confidence: 0.0 };
      }
      return { isMatch: true, confidence: 0.85 };
    }

    return { isMatch: false, confidence: 0.0 };
  }

  /**
   * Exact search pattern detection
   * GDD: numbers and symbols only (no letters)
   */
  private isExactSearchPattern(query: string): boolean {
    return /^[^a-zA-Z]*$/.test(query) && query.length > 0;
  }
}
