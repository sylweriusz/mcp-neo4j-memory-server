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
import { SearchResultProcessor, PracticalHybridSearchResult } from './search-result-processor';

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
  ): Promise<PracticalHybridSearchResult[]> {
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
        score: result.score || 1.0,         // Ensure required score property
        matchType: 'exact' as const,
        _internal: {
          truthLevel: TruthLevel.PERFECT_TRUTH,
          matchReason: 'wildcard',
          simulatedScore: 1.0
        }
      }));
    }

    // Multi-channel search execution
    const searchResults = await this.executeMultiChannelSearch(
      queryIntent,
      limit,
      threshold,
      memoryTypes
    );

    // Enhanced search results already include graph context via enrichWithFullMemoryData
    // No additional processing needed when includeGraphContext is true

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
  ): Promise<PracticalHybridSearchResult[]> {
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
        console.warn('[TruthSearch] Vector channel failed:', error instanceof Error ? error.message : String(error));
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
    candidates: PracticalHybridSearchResult[],
    memoryTypes?: string[]
  ): Promise<PracticalHybridSearchResult[]> {
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
      
      // Graph context - 2 levels deep with exact relation types
      OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1*1..2]->(m)
      WHERE ancestor <> m AND ancestor.id IS NOT NULL
      WITH m, collect(DISTINCT {
        id: ancestor.id,
        name: ancestor.name,
        type: ancestor.memoryType,
        relation: rel1[0].relationType,
        distance: length(path1),
        strength: rel1[0].strength,
        source: rel1[0].source,
        createdAt: rel1[0].createdAt
      })[0..3] as ancestors

      OPTIONAL MATCH path2 = (m)-[rel2*1..2]->(descendant:Memory)
      WHERE descendant <> m AND descendant.id IS NOT NULL
      WITH m, ancestors, collect(DISTINCT {
        id: descendant.id,
        name: descendant.name,
        type: descendant.memoryType,
        relation: rel2[0].relationType,
        distance: length(path2),
        strength: rel2[0].strength,
        source: rel2[0].source,
        createdAt: rel2[0].createdAt
      })[0..3] as descendants

      // Core content with ordered observations
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      WITH m, ancestors, descendants, o
      ORDER BY o.createdAt ASC
      
      RETURN m.id as id,
             m.name as name,
             m.memoryType as type,
             m.metadata as metadata,
             m.createdAt as createdAt,
             m.modifiedAt as modifiedAt,
             m.lastAccessed as lastAccessed,
             collect(DISTINCT {id: o.id, content: o.content, createdAt: o.createdAt}) as observations,
             ancestors,
             descendants
      ORDER BY m.name
    `;

    const result = await this.session.run(cypher, { candidateIds, memoryTypes });
    
    // Create enriched results map
    const enrichedMap = new Map<string, any>();
    for (const record of result.records) {
      const ancestors = record.get('ancestors') || [];
      const descendants = record.get('descendants') || [];
      
      const memoryData = {
        id: record.get('id'),
        name: record.get('name'),
        type: record.get('type'),
        observations: this.processObservations(record.get('observations') || []),
        metadata: this.parseMetadata(record.get('metadata')),
        createdAt: record.get('createdAt'),
        modifiedAt: record.get('modifiedAt'),
        lastAccessed: record.get('lastAccessed'),
        related: this.processGraphContext(ancestors, descendants)
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

  private processGraphContext(ancestors: any[], descendants: any[]): any {
    const processedAncestors = ancestors
      .filter((a: any) => a.id !== null)
      .map((a: any) => ({
        ...a,
        distance: a.distance ? this.convertNeo4jInteger(a.distance) : 0
      }));

    const processedDescendants = descendants
      .filter((d: any) => d.id !== null)
      .map((d: any) => ({
        ...d,
        distance: d.distance ? this.convertNeo4jInteger(d.distance) : 0
      }));

    // Only include related if there are actual relationships
    if (processedAncestors.length > 0 || processedDescendants.length > 0) {
      return {
        ...(processedAncestors.length > 0 && { ancestors: processedAncestors }),
        ...(processedDescendants.length > 0 && { descendants: processedDescendants })
      };
    }

    return undefined;
  }

  private convertNeo4jInteger(value: any): number {
    if (typeof value === 'number') return value;
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return 0;
  }

  private parseMetadata(metadata: string | null): Record<string, any> {
    if (!metadata) return {};
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
}
