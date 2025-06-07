/**
 * Simplified Search Service - Clean Architecture Implementation
 * Single responsibility: Execute search with transparent mathematical scoring
 * 
 * THE IMPLEMENTOR'S RULE: No truth levels, no orchestration theater, just math
 */

import { Session } from 'neo4j-driver';
import { QueryClassifier, QueryIntent, QueryType } from './query-classifier';
import { ExactSearchChannel } from './exact-search-channel';
import { VectorSearchChannel, VectorCandidate } from './vector-search-channel';
import { WildcardSearchService } from './wildcard-search-service';
import { EnhancedSearchResult } from '../../../types';

export interface SimpleSearchResult extends EnhancedSearchResult {
  score: number;                    // Raw mathematical similarity (0.0-1.0)
  matchType: 'semantic' | 'exact';  // Simple binary classification
}

/**
 * Clean search service that eliminates truth-level complexity
 * Direct execution: Query → Classification → Search → Score → Results
 */
export class SimplifiedSearchService {
  private queryClassifier: QueryClassifier;
  private exactChannel: ExactSearchChannel;
  private vectorChannel: VectorSearchChannel;
  private wildcardService: WildcardSearchService;

  constructor(private session: Session) {
    this.queryClassifier = new QueryClassifier();
    this.exactChannel = new ExactSearchChannel(session);
    this.vectorChannel = new VectorSearchChannel(session);
    this.wildcardService = new WildcardSearchService(session);
  }

  /**
   * Execute search with simplified, transparent scoring
   */
  async search(
    query: string,
    limit: number = 10,
    includeGraphContext: boolean = true,
    memoryTypes?: string[],
    threshold: number = 0.1
  ): Promise<SimpleSearchResult[]> {
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
        score: 1.0,         // Wildcard gets perfect score
        matchType: 'exact' as const
      }));
    }

    // Execute multi-channel search
    return this.executeSearch(queryIntent, limit, threshold, memoryTypes);
  }

  /**
   * Execute search across exact and vector channels
   */
  private async executeSearch(
    queryIntent: QueryIntent,
    limit: number,
    threshold: number,
    memoryTypes?: string[]
  ): Promise<SimpleSearchResult[]> {
    
    // Execute exact search (always)
    const exactCandidates = await this.exactChannel.search(
      queryIntent.preprocessing.normalized,
      limit * 2,
      memoryTypes
    );

    // Execute vector search (semantic queries only)
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
        // Vector search failed - continue with exact results only
      }
    }

    // Combine and score candidates
    const candidateMap = new Map<string, {
      id: string;
      hasExactMatch: boolean;
      vectorScore?: number;
    }>();

    // Process exact candidates
    for (const exact of exactCandidates) {
      candidateMap.set(exact.id, {
        id: exact.id,
        hasExactMatch: true
      });
    }

    // Process vector candidates
    for (const vector of vectorCandidates) {
      const existing = candidateMap.get(vector.id);
      if (existing) {
        existing.vectorScore = vector.score;
      } else {
        candidateMap.set(vector.id, {
          id: vector.id,
          hasExactMatch: false,
          vectorScore: vector.score
        });
      }
    }

    // Score and filter candidates
    const scoredCandidates = Array.from(candidateMap.values())
      .map(candidate => this.calculateSimpleScore(candidate))
      .filter(result => result.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Enrich with full memory data
    return this.enrichWithMemoryData(scoredCandidates, memoryTypes);
  }

  /**
   * Calculate simple mathematical score without truth levels
   */
  private calculateSimpleScore(candidate: {
    id: string;
    hasExactMatch: boolean;
    vectorScore?: number;
  }): { id: string; score: number; matchType: 'semantic' | 'exact' } {
    
    if (candidate.hasExactMatch) {
      // Exact match gets high score, boosted if also has vector similarity
      const baseScore = 0.85;
      const vectorBoost = candidate.vectorScore ? Math.min(candidate.vectorScore * 0.15, 0.15) : 0;
      return {
        id: candidate.id,
        score: Math.min(baseScore + vectorBoost, 1.0),
        matchType: 'exact'
      };
    }

    if (candidate.vectorScore) {
      // Pure semantic match
      return {
        id: candidate.id,
        score: candidate.vectorScore,
        matchType: 'semantic'
      };
    }

    // Should not happen, but safety net
    return {
      id: candidate.id,
      score: 0.1,
      matchType: 'exact'
    };
  }

  /**
   * Enrich scored candidates with full memory data
   */
  private async enrichWithMemoryData(
    candidates: Array<{ id: string; score: number; matchType: 'semantic' | 'exact' }>,
    memoryTypes?: string[]
  ): Promise<SimpleSearchResult[]> {
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
      WITH m, ancestors, descendants,
           collect(DISTINCT {id: o.id, content: o.content, createdAt: o.createdAt}) as observations
      
      RETURN m.id as id,
             m.name as name,
             m.memoryType as type,
             m.metadata as metadata,
             m.createdAt as createdAt,
             m.modifiedAt as modifiedAt,
             m.lastAccessed as lastAccessed,
             observations,
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
    return candidates
      .map(candidate => {
        const enriched = enrichedMap.get(candidate.id);
        if (enriched) {
          return {
            ...enriched,
            score: candidate.score,
            matchType: candidate.matchType
          };
        }
        // Return stub if enrichment failed
        return {
          id: candidate.id,
          name: `Unknown Memory ${candidate.id}`,
          type: 'unknown',
          observations: [],
          metadata: {},
          score: candidate.score,
          matchType: candidate.matchType
        };
      })
      .filter(result => result.id); // Remove any failed enrichments
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
