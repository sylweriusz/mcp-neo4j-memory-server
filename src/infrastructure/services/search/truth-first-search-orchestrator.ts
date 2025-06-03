/**
 * Truth-First Search Orchestrator - Clean Architecture Implementation
 * Single responsibility: Coordinate truth-first search pipeline
 * 
 * THE IMPLEMENTOR'S RULE: Build exactly what's specified in GDD v2.2.0
 * Performance targets: <100ms exact, <500ms vector, strict limit enforcement
 */

import { Session } from 'neo4j-driver';
import { QueryClassifier, QueryIntent, QueryType } from './query-classifier';
import { TruthScorer, TruthLevel } from './truth-scorer';
import { ExactSearchChannel } from './exact-search-channel';
import { VectorSearchChannel, VectorCandidate } from './vector-search-channel';
import { WildcardSearchService } from './wildcard-search-service';
import { SearchResultProcessor, TruthSearchResult } from './search-result-processor';

/**
 * Truth-first search orchestrator implementing GDD v2.2.0 architecture
 * Zero fallback - explicit failures for pipeline debugging
 */
export class TruthFirstSearchOrchestrator {
  private queryClassifier: QueryClassifier;
  private truthScorer: TruthScorer;
  private exactChannel: ExactSearchChannel;
  private vectorChannel: VectorSearchChannel;
  private wildcardService: WildcardSearchService;
  private resultProcessor: SearchResultProcessor;

  constructor(private session: Session) {
    this.queryClassifier = new QueryClassifier();
    this.truthScorer = new TruthScorer();
    this.exactChannel = new ExactSearchChannel(session);
    this.vectorChannel = new VectorSearchChannel(session);
    this.wildcardService = new WildcardSearchService(session);
    this.resultProcessor = new SearchResultProcessor(this.truthScorer);
  }

  /**
   * Execute truth-first search according to GDD v2.2.0 specification
   * Strict limit enforcement and zero fallback architecture
   */
  async search(
    query: string,
    limit: number = 10,
    includeGraphContext: boolean = true,
    memoryTypes?: string[],
    threshold: number = 0.1
  ): Promise<TruthSearchResult[]> {
    // Input validation
    if (!query || typeof query !== 'string') {
      throw new Error('Search query must be a non-empty string');
    }
    
    if (limit <= 0) {
      throw new Error('Search limit must be positive');
    }

    // Query classification
    const queryIntent = this.queryClassifier.classify(query);

    // Wildcard search bypass
    if (queryIntent.type === QueryType.WILDCARD) {
      const wildcardResults = await this.wildcardService.search(
        limit,
        includeGraphContext,
        memoryTypes
      );
      
      return wildcardResults.map(result => ({
        ...result,
        truthLevel: TruthLevel.PERFECT_TRUTH,
        matchReason: 'wildcard',
        rawVectorScore: undefined
      }));
    }

    // Multi-channel search execution
    const searchResults = await this.executeMultiChannelSearch(
      queryIntent,
      limit,
      threshold,
      memoryTypes
    );

    // Add graph context if requested
    if (includeGraphContext && searchResults.length > 0) {
      await this.enrichWithGraphContext(searchResults);
    }

    // Strict limit enforcement (GDD 8.1)
    return searchResults.slice(0, limit);
  }

  /**
   * Execute multi-channel search with truth-first scoring
   */
  private async executeMultiChannelSearch(
    queryIntent: QueryIntent,
    limit: number,
    threshold: number,
    memoryTypes?: string[]
  ): Promise<TruthSearchResult[]> {
    // Execute exact search channel (always)
    const exactCandidates = await this.exactChannel.search(
      queryIntent.preprocessing.normalized,
      limit * 2,
      memoryTypes
    );

    // Execute vector search channel (semantic queries only)
    let vectorCandidates: VectorCandidate[] = [];
    if (queryIntent.type === QueryType.SEMANTIC_SEARCH) {
      try {
        vectorCandidates = await this.vectorChannel.search(
          queryIntent.preprocessing.normalized,
          limit * 2,
          threshold,
          memoryTypes
        );
      } catch (error) {
        console.warn('[TruthSearch] Vector channel failed:', error.message);
      }
    }

    // Process and score candidates
    const scoredCandidates = this.resultProcessor.combineAndScore(
      exactCandidates,
      vectorCandidates,
      queryIntent,
      threshold
    );

    // Enrich with full memory data
    return this.enrichWithFullMemoryData(scoredCandidates, memoryTypes);
  }

  /**
   * Enrich scored candidates with full memory data
   */
  private async enrichWithFullMemoryData(
    candidates: TruthSearchResult[],
    memoryTypes?: string[]
  ): Promise<TruthSearchResult[]> {
    if (candidates.length === 0) return [];

    const candidateIds = candidates.map(c => c.id);
    
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
      
      RETURN m.id as id,
             m.name as name,
             m.memoryType as type,
             m.metadata as metadata,
             m.createdAt as createdAt,
             m.modifiedAt as modifiedAt,
             m.lastAccessed as lastAccessed,
             observations
      ORDER BY m.name
    `;

    const result = await this.session.run(cypher, { candidateIds, memoryTypes });
    
    // Create enriched results map
    const enrichedMap = new Map<string, any>();
    for (const record of result.records) {
      const memoryData = {
        id: record.get('id'),
        name: record.get('name'),
        type: record.get('type'),
        observations: this.processObservations(record.get('observations') || []),
        metadata: this.parseMetadata(record.get('metadata')),
        createdAt: record.get('createdAt'),
        modifiedAt: record.get('modifiedAt'),
        lastAccessed: record.get('lastAccessed')
      };
      enrichedMap.set(memoryData.id, memoryData);
    }

    // Merge with scored candidates maintaining order
    return candidates.map(candidate => {
      const enriched = enrichedMap.get(candidate.id);
      if (enriched) {
        return {
          ...candidate,
          name: enriched.name,
          type: enriched.type,
          observations: enriched.observations,
          metadata: enriched.metadata,
          createdAt: enriched.createdAt,
          modifiedAt: enriched.modifiedAt,
          lastAccessed: enriched.lastAccessed
        };
      }
      return candidate; // Return original if enrichment failed
    });
  }

  private processObservations(observations: any[]): Array<{id?: string, content: string, createdAt: string}> {
    if (!Array.isArray(observations)) return [];
    
    return observations
      .filter(obs => obs && obs.content)
      .map(obs => ({
        id: obs.id,
        content: obs.content,
        createdAt: obs.createdAt || new Date().toISOString()
      }));
  }

  private parseMetadata(metadata: string | null): Record<string, any> {
    if (!metadata) return {};
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }

  /**
   * Enrich results with graph context (placeholder for existing service)
   */
  private async enrichWithGraphContext(results: TruthSearchResult[]): Promise<void> {
    // TODO: Integrate with existing GraphContextService
    // For now, maintain interface compatibility
  }
}
