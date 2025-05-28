import { Session } from 'neo4j-driver';
import { SearchStrategyService } from './search-strategy-service';
import { VectorSearchService } from './vector-search-service';
import { MetadataSearchService } from './metadata-search-service';
import { GraphContextService } from './graph-context-service';
import { SearchResultsAggregator } from './search-results-aggregator';
import { 
  SearchConfig, 
  EnhancedSearchResult, 
  DEFAULT_SEARCH_CONFIG 
} from '../../../domain/entities/search-config';

/**
 * Enhanced unified search orchestrator
 * Single responsibility: coordinate search operations
 */
export class SearchOrchestrator {
  private strategyService: SearchStrategyService;
  private vectorService: VectorSearchService;
  private metadataService: MetadataSearchService;
  private graphService: GraphContextService;
  private aggregator: SearchResultsAggregator;

  constructor(
    private session: Session,
    private config: SearchConfig = DEFAULT_SEARCH_CONFIG
  ) {
    this.strategyService = new SearchStrategyService(config);
    this.vectorService = new VectorSearchService(session);
    this.metadataService = new MetadataSearchService(session);
    this.graphService = new GraphContextService(session, config);
    this.aggregator = new SearchResultsAggregator(config);
  }

  async search(
    query: string,
    limit: number = 10,
    includeGraphContext: boolean = true,
    memoryTypes?: string[],
    threshold?: number
  ): Promise<EnhancedSearchResult[]> {
    const searchThreshold = threshold || this.config.threshold;
    const strategy = this.strategyService.determineStrategy(query);

    try {
      // Wildcard search - special case
      if (strategy.strategy === 'wildcard') {
        return this.handleWildcardSearch(limit, includeGraphContext, memoryTypes);
      }

      // Regular search pipeline
      const searchResults = await this.executeSearchPipeline(
        query,
        strategy,
        limit,
        searchThreshold,
        memoryTypes
      );

      // Add graph context if requested
      if (includeGraphContext && searchResults.length > 0) {
        await this.enrichWithGraphContext(searchResults);
      }

      // Fix Neo4j Integer conversion in search results - BUG #1 FIX
      const fixedResults = searchResults.map(result => {
        if (result.related) {
          if (result.related.ancestors) {
            result.related.ancestors = result.related.ancestors.map(ancestor => ({
              ...ancestor,
              distance: this.convertNeo4jInteger(ancestor.distance)
            }));
          }
          if (result.related.descendants) {
            result.related.descendants = result.related.descendants.map(descendant => ({
              ...descendant,
              distance: this.convertNeo4jInteger(descendant.distance)
            }));
          }
        }
        return result;
      });

      return fixedResults.slice(0, limit);
    } catch (error) {
      console.error(`Search orchestration failed: ${error}`);
      throw error; // No fallbacks - fix the pipeline
    }
  }

  private async handleWildcardSearch(
    limit: number,
    includeGraphContext: boolean,
    memoryTypes?: string[]
  ): Promise<EnhancedSearchResult[]> {
    // Limit validation handled at entry point
    const rawResults = await this.graphService.searchWildcardWithContext(
      limit,
      memoryTypes
    );

    return this.aggregator.formatSearchResults(rawResults, includeGraphContext);
  }

  private async executeSearchPipeline(
    query: string,
    strategy: any,
    limit: number,
    threshold: number,
    memoryTypes?: string[]
  ): Promise<EnhancedSearchResult[]> {
    let vectorCandidates: string[] = [];
    let exactMatches: string[] = [];
    let fulltextMatches: string[] = [];
    let tagMatches: string[] = [];

    // Execute search methods based on strategy
    if (strategy.shouldUseVector) {
      const vectorResult = await this.vectorService.searchByVector(query, limit * 2, threshold, memoryTypes);
      vectorCandidates = vectorResult.vectorCandidates;
    }

    if (strategy.shouldUseMetadata) {
      const metadataResult = await this.metadataService.searchByMetadata(query, limit * 2, memoryTypes);
      exactMatches = metadataResult.exactMatches;
      fulltextMatches = metadataResult.fulltextMatches;
    }

    // Tag search for all strategies except wildcard
    tagMatches = await this.metadataService.searchByTags(query, limit, memoryTypes);

    // Combine all candidate IDs
    const allCandidateIds = new Set([
      ...vectorCandidates,
      ...exactMatches,
      ...fulltextMatches,
      ...tagMatches
    ]);

    if (allCandidateIds.size === 0) {
      return [];
    }

    // Get full results for all candidates
    const fullResults = await this.getFullResultsForCandidates(Array.from(allCandidateIds), memoryTypes);

    // Score and rank results with dynamic threshold
    return this.scoreAndRankResultsWithThreshold(
      query,
      fullResults,
      vectorCandidates,
      exactMatches,
      fulltextMatches,
      tagMatches,
      threshold
    );
  }

  private async getFullResultsForCandidates(candidateIds: string[], memoryTypes?: string[]): Promise<EnhancedSearchResult[]> {
    if (candidateIds.length === 0) return [];

    // Build WHERE clause with memory type filtering
    let whereClause = 'WHERE m.id IN $candidateIds';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }

    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      
      // Collect observations with proper ordering
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      WITH m, o ORDER BY o.createdAt ASC
      WITH m, collect(DISTINCT {id: o.id, content: o.content, createdAt: o.createdAt}) as observations
      
      // Collect tags separately to avoid cross-product issues
      OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
      WITH m, observations, collect(DISTINCT t.name) as tags
      
      RETURN m.id as id,
             m.name as name,
             m.memoryType as type,
             m.metadata as metadata,
             observations,
             tags
      ORDER BY m.name
    `;

    const result = await this.session.run(cypher, { candidateIds, memoryTypes });
    
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      type: record.get('type'),
      observations: record.get('observations').filter((obs: any) => obs.content),
      tags: record.get('tags').filter((tag: string) => tag),
      metadata: JSON.parse(record.get('metadata') || '{}')
    }));
  }

  private async enrichWithGraphContext(results: EnhancedSearchResult[]): Promise<void> {
    const memoryIds = results.map(r => r.id);
    const contextMap = await this.graphService.getGraphContext(memoryIds);
    
    for (const result of results) {
      const context = contextMap.get(result.id);
      if (context) {
        result.related = context;
      }
    }
  }

  /**
   * Score and rank results with dynamic threshold override
   * This method allows overriding the config threshold with a request-specific value
   */
  private async scoreAndRankResultsWithThreshold(
    query: string,
    results: EnhancedSearchResult[],
    vectorCandidates: string[] = [],
    exactMatches: string[] = [],
    fulltextMatches: string[] = [],
    tagMatches: string[] = [],
    threshold: number
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

    // Filter by the dynamic threshold parameter, not the config threshold
    return scoredResults
      .filter(result => result.score! >= threshold)
      .sort((a, b) => b.score! - a.score!);
  }

  /**
   * Calculate composite score using the same logic as SearchResultsAggregator
   */
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

  /**
   * Convert Neo4j Integer to JavaScript number - BUG #1 FIX
   * Handles both Neo4j Integer objects and regular numbers
   */
  private convertNeo4jInteger(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    
    // Check if it's a Neo4j Integer object with toNumber method
    if (typeof value === 'object' && value.toNumber) {
      return value.toNumber();
    }
    
    // Check if it's a Neo4j Integer with low/high properties
    if (typeof value === 'object' && typeof value.low === 'number' && typeof value.high === 'number') {
      // Convert using Neo4j integer construction
      return value.low + (value.high * 0x100000000);
    }
    
    // If it's already a number, return as-is
    if (typeof value === 'number') {
      return value;
    }
    
    // Fallback: try to parse as number
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? 0 : parsed;
  }
}
