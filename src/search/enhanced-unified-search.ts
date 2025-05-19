import { Session } from 'neo4j-driver';
import { calculateEmbedding, Vector } from '../vector/embeddings';
import { checkVectorSupport } from '../vector/support';

export interface SearchScoreWeights {
  vector: number;
  metadataExact: number;
  metadataFulltext: number;
  tags: number;
}

export interface SearchConfig {
  weights: SearchScoreWeights;
  threshold: number;
  maxGraphDepth: number;
  maxRelatedItems: number;
}

export interface RelatedMemory {
  id: string;
  name: string;
  type: string;
  relation: string;
  distance: number;
}

export interface EnhancedSearchResult {
  id: string;
  name: string;
  type: string;
  observations: Array<{content: string, createdAt: string}>;
  tags: string[];
  metadata: Record<string, any>;
  related?: {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
  score?: number;
}

const DEFAULT_CONFIG: SearchConfig = {
  weights: {
    vector: 0.5,
    metadataExact: 0.25,
    metadataFulltext: 0.15,
    tags: 0.1
  },
  threshold: 0.1,
  maxGraphDepth: 2,
  maxRelatedItems: 3
};

export class EnhancedUnifiedSearch {
  private session: Session;
  private config: SearchConfig;
  private vectorSupport: 'enterprise' | 'gds' | 'none' | null = null;

  constructor(session: Session, config: Partial<SearchConfig> = {}) {
    this.session = session;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async search(
    query: string, 
    limit: number = 10,
    includeGraphContext: boolean = true,
    memoryTypes?: string[]
  ): Promise<EnhancedSearchResult[]> {
    try {
      // Special handling for wildcard queries with limit enforcement
      if (query === "*" || query === "()" || !query || query.trim() === "") {
        return this.searchAllMemories(limit, includeGraphContext, memoryTypes);
      }
      
      // 1. Get fulltext metadata candidates
      const fulltextCandidates = await this.getFulltextCandidates(query, memoryTypes);
      
      // 2. Execute main unified query
      const results = await this.executeUnifiedQuery(query, fulltextCandidates, includeGraphContext, memoryTypes);
      
      // 3. Score and rank results
      const scoredResults = await this.scoreAndRankResults(query, results, fulltextCandidates);
      
      // 4. Filter by threshold first, then sort and limit
      const filteredResults = scoredResults.filter(result => result.score! >= this.config.threshold);
      
      return filteredResults.slice(0, limit);
    } catch (error) {
      // Enhanced search failed - throwing error to caller
      throw error;
    }
  }

  private async searchAllMemories(
    limit: number,
    includeGraphContext: boolean,
    memoryTypes?: string[]
  ): Promise<EnhancedSearchResult[]> {
    // Build WHERE clause for memory type filtering - Bug #2 fix
    let whereClause = '';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause = ` WHERE m.memoryType IN $memoryTypes`;
    }

    let graphContextQuery = '';
    if (includeGraphContext) {
      graphContextQuery = `
        // Graph context - 2 levels deep with correct relation types  
        OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1:RELATES_TO*1..2]->(m)
        WHERE ancestor <> m AND ancestor.id IS NOT NULL
        WITH m, collect(DISTINCT {
          id: ancestor.id, 
          name: ancestor.name, 
          type: ancestor.memoryType,
          relation: rel1[0].relationType,
          distance: length(path1)
        })[0..$maxRelated] as ancestors

        OPTIONAL MATCH path2 = (m)-[rel2:RELATES_TO*1..2]->(descendant:Memory)  
        WHERE descendant <> m AND descendant.id IS NOT NULL
        WITH m, ancestors, collect(DISTINCT {
          id: descendant.id,
          name: descendant.name, 
          type: descendant.memoryType,
          relation: rel2[0].relationType,
          distance: length(path2)
        })[0..$maxRelated] as descendants
      `;
    }

    const cypher = `
      MATCH (m:Memory)${whereClause}
      ${graphContextQuery}

      // Core content with observations as objects (matching retrieve format)
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)

      RETURN m.id as id,
             m.name as name,
             m.memoryType as type, 
             m.metadata as metadata,
             m.nameEmbedding as embedding,
             [obs IN collect(DISTINCT {content: o.content, createdAt: o.createdAt}) WHERE obs.content IS NOT NULL | obs] as observationObjects,
             collect(DISTINCT t.name)[0..3] as tags
             ${includeGraphContext ? ',ancestors, descendants' : ''}
      ORDER BY m.name
      LIMIT $limit
    `;

    const result = await this.session.run(cypher, {
      memoryTypes,
      maxRelated: this.config.maxRelatedItems,
      limit
    });

    // Process results into EnhancedSearchResult format
    const searchResults: EnhancedSearchResult[] = [];

    for (const record of result.records) {
      const result: EnhancedSearchResult = {
        id: record.get('id'),
        name: record.get('name'),
        type: record.get('type'),
        observations: this.processObservationObjects(record.get('observationObjects')),
        tags: record.get('tags') || [],
        metadata: JSON.parse(record.get('metadata') || '{}'),
        score: 1.0 // All results get equal score for wildcard search
      };

      // Add graph context if available - with additional null filtering
      if (includeGraphContext && (record.has('ancestors') || record.has('descendants'))) {
        const ancestors = record.get('ancestors') || [];
        const descendants = record.get('descendants') || [];
        
        // Only include if we have actual relationships
        if (ancestors.length > 0 || descendants.length > 0) {
          result.related = {
            ancestors: ancestors.filter((item: any) => item && item.id),
            descendants: descendants.filter((item: any) => item && item.id)
          };
        }
      }

      searchResults.push(result);
    }

    return searchResults;
  }

  private async getFulltextCandidates(query: string, memoryTypes?: string[]): Promise<Map<string, number>> {
    try {
      const escapedQuery = query.replace(/[^\w\s]/g, '').trim();
      if (!escapedQuery) return new Map();

      let cypher = `
        CALL db.index.fulltext.queryNodes("memory_metadata_idx", $query) 
        YIELD node, score
        WHERE node:Memory 
      `;
      
      if (memoryTypes && memoryTypes.length > 0) {
        cypher += ` AND node.memoryType IN $memoryTypes`;
      }
      
      cypher += `
        RETURN node.id as id, score
        ORDER BY score DESC
        LIMIT 100
      `;

      const result = await this.session.run(cypher, { query: escapedQuery, memoryTypes });

      const candidates = new Map<string, number>();
      result.records.forEach(record => {
        candidates.set(record.get('id'), record.get('score'));
      });
      
      return candidates;
    } catch (error) {
      // Fulltext search failed - continuing without
      return new Map();
    }
  }

  private async executeUnifiedQuery(
    query: string, 
    fulltextCandidates: Map<string, number>,
    includeGraphContext: boolean,
    memoryTypes?: string[]
  ) {
    const candidateIds = Array.from(fulltextCandidates.keys());
    
    let graphContextQuery = '';
    if (includeGraphContext) {
      graphContextQuery = `
        // Graph context - 2 levels deep with correct relation types  
        OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1:RELATES_TO*1..2]->(m)
        WHERE ancestor <> m AND ancestor.id IS NOT NULL
        WITH m, collect(DISTINCT {
          id: ancestor.id, 
          name: ancestor.name, 
          type: ancestor.memoryType,
          relation: rel1[0].relationType,
          distance: length(path1)
        })[0..$maxRelated] as ancestors

        OPTIONAL MATCH path2 = (m)-[rel2:RELATES_TO*1..2]->(descendant:Memory)  
        WHERE descendant <> m AND descendant.id IS NOT NULL
        WITH m, ancestors, collect(DISTINCT {
          id: descendant.id,
          name: descendant.name, 
          type: descendant.memoryType,
          relation: rel2[0].relationType,
          distance: length(path2)
        })[0..$maxRelated] as descendants
      `;
    }

    let cypher = `
      MATCH (m:Memory)
      WHERE (m.nameEmbedding IS NOT NULL OR m.id IN $candidateIds)
    `;
    
    // Add memory type filter (Bug #2 fix) - ensure type filtering works in all search modes
    if (memoryTypes && memoryTypes.length > 0) {
      cypher += ` AND m.memoryType IN $memoryTypes`;
    }

    cypher += `
      ${graphContextQuery}

      // Core content with observations as objects (matching retrieve format)
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)

      RETURN m.id as id,
             m.name as name,
             m.memoryType as type, 
             m.metadata as metadata,
             m.nameEmbedding as embedding,
             [obs IN collect(DISTINCT {content: o.content, createdAt: o.createdAt}) WHERE obs.content IS NOT NULL | obs] as observationObjects,
             collect(DISTINCT t.name)[0..3] as tags
             ${includeGraphContext ? ',ancestors, descendants' : ''}
    `;

    return await this.session.run(cypher, {
      candidateIds,
      maxRelated: this.config.maxRelatedItems,
      memoryTypes
    });
  }

  // THE FIX: Gracefully handle embedding calculation failures
  private async scoreAndRankResults(
    query: string,
    dbResults: any,
    fulltextCandidates: Map<string, number>
  ): Promise<EnhancedSearchResult[]> {
    // Try to calculate query embedding, but don't fail the entire search if it falls short
    let queryVector: Vector | null = null;
    try {
      queryVector = await calculateEmbedding(query);
    } catch (error) {
      // Query embedding calculation failed - proceeding without vector scoring
    }

    const scoredResults: EnhancedSearchResult[] = [];

    for (const record of dbResults.records) {
      const id = record.get('id');
      const embedding = record.get('embedding');
      const metadata = JSON.parse(record.get('metadata') || '{}');
      
      // Calculate component scores
      const vectorScore = (embedding && queryVector) ? 
        await this.calculateVectorScore(queryVector, embedding) : 0;
      const metadataExactScore = this.calculateMetadataExactScore(query, metadata);
      const fulltextScore = fulltextCandidates.get(id) || 0;
      const tagScore = this.calculateTagScore(query, record.get('tags') || []);
      
      // Adjust weights when vector scoring is unavailable
      const effectiveWeights = queryVector ? this.config.weights : {
        vector: 0,
        metadataExact: 0.4,
        metadataFulltext: 0.35,
        tags: 0.25
      };
      
      // Combined final score
      const finalScore = (
        (vectorScore * effectiveWeights.vector) +
        (metadataExactScore * effectiveWeights.metadataExact) +
        (fulltextScore * effectiveWeights.metadataFulltext) +
        (tagScore * effectiveWeights.tags)
      );

      const result: EnhancedSearchResult = {
        id,
        name: record.get('name'),
        type: record.get('type'),
        observations: this.processObservationObjects(record.get('observationObjects')),
        tags: record.get('tags') || [],
        metadata: this.filterRelevantMetadata(metadata, query),
        score: finalScore
      };

      // Add graph context if available - with additional null filtering
      if (record.has('ancestors') || record.has('descendants')) {
        const ancestors = record.get('ancestors') || [];
        const descendants = record.get('descendants') || [];
        
        // Only include if we have actual relationships
        if (ancestors.length > 0 || descendants.length > 0) {
          result.related = {
            ancestors: ancestors.filter((item: any) => item && item.id),
            descendants: descendants.filter((item: any) => item && item.id)
          };
        }
      }

      scoredResults.push(result);
    }

    return scoredResults.sort((a, b) => b.score! - a.score!);
  }

  private async calculateVectorScore(queryVector: Vector, embedding: number[]): Promise<number> {
    if (!this.vectorSupport) {
      this.vectorSupport = await checkVectorSupport(this.session);
    }

    // Use appropriate similarity calculation based on available support
    switch (this.vectorSupport) {
      case 'gds':
        // GDS is available in the session context during query execution
        // For now, calculate in memory as fallback
        return this.calculateCosineSimilarity(queryVector, embedding);
      case 'enterprise':
        // Enterprise vector functions not accessible outside query context
        return this.calculateCosineSimilarity(queryVector, embedding);
      default:
        return this.calculateCosineSimilarity(queryVector, embedding);
    }
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private calculateMetadataExactScore(query: string, metadata: Record<string, any>): number {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let totalScore = 0;
    
    for (const [fieldName, fieldValue] of Object.entries(metadata)) {
      const valueStr = Array.isArray(fieldValue) 
        ? fieldValue.join(' ').toLowerCase()
        : String(fieldValue).toLowerCase();
      
      // Exact field value matches
      for (const token of queryTokens) {
        if (valueStr.includes(token)) {
          totalScore += 0.5; // Major boost for content matches
        }
        if (fieldName.toLowerCase().includes(token)) {
          totalScore += 0.2; // Minor boost for field name matches
        }
      }
    }
    
    return Math.min(totalScore, 1.0); // Cap at 1.0
  }

  private calculateTagScore(query: string, tags: string[]): number {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let matchCount = 0;
    
    for (const tag of tags) {
      for (const token of queryTokens) {
        if (tag.toLowerCase().includes(token)) {
          matchCount++;
          break; // Count each tag only once
        }
      }
    }
    
    return queryTokens.length > 0 ? matchCount / queryTokens.length : 0;
  }

  private processObservationObjects(observationObjects: any[]): Array<{content: string, createdAt: string}> {
    if (!observationObjects || !Array.isArray(observationObjects)) {
      return [];
    }
    
    // Sort by createdAt (oldest first) and return full objects
    return observationObjects
      .filter(obj => obj && obj.content)
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB; // Ascending order (oldest first)
      });
  }

  private filterRelevantMetadata(
    metadata: Record<string, any>, 
    query: string
  ): Record<string, any> {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const relevantFields: [string, any, number][] = [];
    
    for (const [key, value] of Object.entries(metadata)) {
      let relevanceScore = 0;
      
      // Score based on query token matches
      for (const token of queryTokens) {
        if (key.toLowerCase().includes(token)) relevanceScore += 2;
        if (String(value).toLowerCase().includes(token)) relevanceScore += 3;
      }
      
      // Always include commonly useful fields
      if (['status', 'type', 'priority', 'technology'].includes(key.toLowerCase())) {
        relevanceScore += 1;
      }
      
      if (relevanceScore > 0) {
        relevantFields.push([key, value, relevanceScore]);
      }
    }
    
    // Return top 3 most relevant fields
    return Object.fromEntries(
      relevantFields
        .sort((a, b) => b[2] - a[2])
        .slice(0, 3)
        .map(([key, value]) => [key, value])
    );
  }
}
