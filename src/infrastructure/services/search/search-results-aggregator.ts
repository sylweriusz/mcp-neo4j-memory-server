import { EnhancedSearchResult, SearchConfig } from '../../../domain/entities/search-config';
import neo4j from 'neo4j-driver';

/**
 * Search results processing and ranking service  
 * Single responsibility: result aggregation and scoring
 */
export class SearchResultsAggregator {
  constructor(private config: SearchConfig) {}

  /**
   * Convert Neo4j Integer to JavaScript number
   * Handles both Neo4j Integer objects and regular numbers
   */
  private convertNeo4jInteger(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    
    // Check if it's a Neo4j Integer object
    if (typeof value === 'object' && value.toNumber) {
      return value.toNumber();
    }
    
    // Check if it's a Neo4j Integer with low/high properties
    if (typeof value === 'object' && typeof value.low === 'number' && typeof value.high === 'number') {
      return neo4j.int(value.low).toNumber();
    }
    
    // If it's already a number, return as-is
    if (typeof value === 'number') {
      return value;
    }
    
    // Fallback: try to parse as number
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  async scoreAndRankResults(
    query: string,
    results: EnhancedSearchResult[],
    vectorCandidates: string[] = [],
    exactMatches: string[] = [],
    fulltextMatches: string[] = [],
    tagMatches: string[] = []
  ): Promise<EnhancedSearchResult[]> {
    const scoredResults = results.map(result => {
      const score = this.calculateCompositeScore(
        result,
        query,
        vectorCandidates,
        exactMatches,
        fulltextMatches,
        tagMatches
      );
      return { ...result, score };
    });

    // Filter by threshold and sort by score
    return scoredResults
      .filter(result => result.score! >= this.config.threshold)
      .sort((a, b) => b.score! - a.score!);
  }

  private calculateCompositeScore(
    result: EnhancedSearchResult,
    query: string,
    vectorCandidates: string[],
    exactMatches: string[],
    fulltextMatches: string[],
    tagMatches: string[]
  ): number {
    let score = 0;

    // Vector similarity score
    if (vectorCandidates.includes(result.id)) {
      score += this.config.weights.vector;
    }

    // Metadata exact match score
    if (exactMatches.includes(result.id)) {
      score += this.config.weights.metadataExact;
    }

    // Metadata fulltext score
    if (fulltextMatches.includes(result.id)) {
      score += this.config.weights.metadataFulltext;
    }

    // Tag matching score
    if (tagMatches.includes(result.id)) {
      score += this.config.weights.tags;
    }

    // Additional scoring factors
    score += this.calculateNameMatchBonus(result.name, query);
    score += this.calculateObservationMatchBonus(result.observations, query);
    
    return Math.min(score, 1.0); // Cap at 1.0
  }

  private calculateNameMatchBonus(name: string, query: string): number {
    const nameLower = name.toLowerCase();
    const queryLower = query.toLowerCase();
    
    if (nameLower === queryLower) return 0.2;
    if (nameLower.includes(queryLower)) return 0.1;
    
    return 0;
  }

  private calculateObservationMatchBonus(
    observations: Array<{content: string, createdAt: string}>,
    query: string
  ): number {
    const queryLower = query.toLowerCase();
    let matchCount = 0;
    
    for (const obs of observations) {
      if (obs.content.toLowerCase().includes(queryLower)) {
        matchCount++;
      }
    }
    
    // Diminishing returns for multiple matches
    return Math.min(matchCount * 0.05, 0.15);
  }

  processObservationObjects(observationObjects: any[]): Array<{id?: string, content: string, createdAt: string}> {
    if (!observationObjects || !Array.isArray(observationObjects)) {
      return [];
    }

    return observationObjects
      .filter(obs => obs && obs.content)
      .map(obs => ({
        id: obs.id,  // BUG FIX: Include observation ID as required by GDD v2.1.0 section 8.4
        content: obs.content,
        createdAt: obs.createdAt || new Date().toISOString()
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  formatSearchResults(
    rawResults: any[],
    includeGraphContext: boolean = true
  ): EnhancedSearchResult[] {
    return rawResults.map(record => {
      const result: EnhancedSearchResult = {
        id: record.id,
        name: record.name,
        type: record.type,
        observations: this.processObservationObjects(record.observationObjects || []),
        tags: record.tags || [],
        metadata: typeof record.metadata === 'string' 
          ? JSON.parse(record.metadata || '{}') 
          : record.metadata || {},
        score: record.score || 1.0
      };

      // Add graph context if available and requested - WITH PROPER DISTANCE CONVERSION
      if (includeGraphContext && (record.ancestors || record.descendants)) {
        const ancestors = record.ancestors || [];
        const descendants = record.descendants || [];
        
        if (ancestors.length > 0 || descendants.length > 0) {
          result.related = {
            ancestors: ancestors.length > 0 ? ancestors.map(a => ({
              ...a,
              distance: this.convertNeo4jInteger(a.distance)
            })) : undefined,
            descendants: descendants.length > 0 ? descendants.map(d => ({
              ...d,
              distance: this.convertNeo4jInteger(d.distance)
            })) : undefined
          };
        }
      }

      return result;
    });
  }
}
