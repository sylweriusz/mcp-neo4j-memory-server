import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { calculateEmbedding, Vector } from '../../utilities';
import { EnhancedSearchResult } from '../../../domain/entities/search-config';

export type VectorSupport = {
  enterprise: boolean;
  gds: boolean;
  none: boolean;
};

/**
 * Vector similarity search service
 * Single responsibility: semantic vector operations with integrated support detection
 */
export class VectorSearchService {
  private supportCache: VectorSupport | null = null;

  constructor(private session: Session) {}

  async searchByVector(
    query: string,
    limit: number,
    threshold: number = 0.1,
    memoryTypes?: string[]
  ): Promise<{ results: EnhancedSearchResult[]; vectorCandidates: string[] }> {
    try {
      const queryVector = await calculateEmbedding(query);
      const vectorSupport = await this.detectVectorSupport();
      
      let vectorCandidateIds: string[] = [];
      
      if (vectorSupport.enterprise) {
        vectorCandidateIds = await this.vectorSearchEnterprise(queryVector, threshold, limit, memoryTypes);
      } else if (vectorSupport.gds) {
        vectorCandidateIds = await this.vectorSearchGDS(queryVector, threshold, limit, memoryTypes);
      } else {
        vectorCandidateIds = await this.vectorSearchInMemory(queryVector, threshold, limit, memoryTypes);
      }

      // Get full results for vector candidates
      const results = await this.getFullResultsForIds(vectorCandidateIds);
      
      return { results, vectorCandidates: vectorCandidateIds };
    } catch (error) {
      console.warn(`Vector search failed: ${error}`);
      return { results: [], vectorCandidates: [] };
    }
  }

  /**
   * Detect Neo4j vector support capabilities
   * Integrated directly into service to eliminate external dependencies
   */
  private async detectVectorSupport(): Promise<VectorSupport> {
    if (process.env.NODE_ENV === 'test') {
      this.supportCache = null;
    }

    if (this.supportCache) {
      return this.supportCache;
    }

    const support: VectorSupport = {
      enterprise: false,
      gds: false,
      none: true
    };

    // Test GDS first
    try {
      await this.session.run(`RETURN gds.similarity.cosine([0.1, 0.2], [0.2, 0.3]) AS test`);
      support.gds = true;
      support.none = false;
    } catch {
      // Continue to enterprise check
    }

    // Test Enterprise if GDS not available
    if (!support.gds) {
      try {
        await this.session.run(`
          CREATE OR REPLACE TEMP FUNCTION test_vector_support (vector1, vector2)
          RETURNS FLOAT 
          BEGIN 
            RETURN vector.similarity(vector1, vector2);
          END;
        `);
        support.enterprise = true;
        support.none = false;
      } catch {
        // Neither enterprise nor GDS available
      }
    }

    this.supportCache = support;
    return support;
  }

  private async vectorSearchEnterprise(
    queryVector: Vector,
    threshold: number,
    limit: number,
    memoryTypes?: string[]
  ): Promise<string[]> {
    let whereClause = 'WHERE m.nameEmbedding IS NOT NULL';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }
    
    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      WITH m, vector.similarity(m.nameEmbedding, $queryVector) AS score
      WHERE score >= $threshold
      ORDER BY score DESC
      LIMIT $limit
      RETURN m.id as id
    `;

    const result = await this.session.run(cypher, { 
      queryVector, 
      threshold: neo4j.int(threshold), 
      limit: neo4j.int(limit),
      memoryTypes
    });
    return result.records.map(record => record.get('id'));
  }

  private async vectorSearchGDS(
    queryVector: Vector,
    threshold: number,
    limit: number,
    memoryTypes?: string[]
  ): Promise<string[]> {
    let whereClause = 'WHERE m.nameEmbedding IS NOT NULL';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }
    
    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      WITH m, gds.similarity.cosine(m.nameEmbedding, $queryVector) AS score
      WHERE score >= $threshold
      ORDER BY score DESC
      LIMIT $limit
      RETURN m.id as id
    `;

    const result = await this.session.run(cypher, { 
      queryVector, 
      threshold: neo4j.int(threshold), 
      limit: neo4j.int(limit),
      memoryTypes
    });
    return result.records.map(record => record.get('id'));
  }

  private async vectorSearchInMemory(
    queryVector: Vector,
    threshold: number,
    limit: number,
    memoryTypes?: string[]
  ): Promise<string[]> {
    let whereClause = 'WHERE m.nameEmbedding IS NOT NULL';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }
    
    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      RETURN m.id as id, m.nameEmbedding as embedding
    `;

    const result = await this.session.run(cypher, { memoryTypes });
    
    // Calculate similarities in memory
    const similarities = result.records.map(record => {
      const embedding = record.get('embedding');
      const similarity = this.cosineSimilarity(queryVector, embedding);
      return { id: record.get('id'), similarity };
    });

    // Filter, sort, and limit
    return similarities
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.id);
  }

  private cosineSimilarity(a: Vector, b: Vector): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private async getFullResultsForIds(ids: string[]): Promise<EnhancedSearchResult[]> {
    if (ids.length === 0) return [];

    const cypher = `
      MATCH (m:Memory)
      WHERE m.id IN $ids
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
      
      WITH m, 
           collect(DISTINCT {id: o.id, content: o.content, createdAt: o.createdAt}) as observations,
           collect(DISTINCT t.name) as tags
      ORDER BY m.name
      
      RETURN m.id as id,
             m.name as name,
             m.memoryType as type,
             m.metadata as metadata,
             observations,
             tags
    `;

    const result = await this.session.run(cypher, { ids });
    
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      type: record.get('type'),
      observations: record.get('observations').filter((obs: any) => obs.content),
      tags: record.get('tags').filter((tag: string) => tag),
      metadata: JSON.parse(record.get('metadata') || '{}')
    }));
  }
}
