/**
 * Vector Search Channel - Semantic Similarity Engine
 * Single responsibility: Vector similarity operations
 * Performance target: <500ms (GDD v2.2.0)
 */

import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { calculateEmbedding, Vector } from '../../utilities';

export interface VectorCandidate {
  id: string;
  score: number;
}

export class VectorSearchChannel {
  private gdsSupport: boolean | null = null;

  constructor(private session: Session) {}

  /**
   * Execute vector similarity search
   * Auto-detects GDS vs in-memory calculation
   */
  async search(
    query: string,
    limit: number,
    threshold: number,
    memoryTypes?: string[]
  ): Promise<VectorCandidate[]> {
    const queryVector = await calculateEmbedding(query);
    const hasGDS = await this.detectGDSSupport();
    
    if (hasGDS) {
      return this.searchGDS(queryVector, limit, threshold, memoryTypes);
    } else {
      return this.searchInMemory(queryVector, limit, threshold, memoryTypes);
    }
  }

  private async searchGDS(
    queryVector: Vector,
    limit: number,
    threshold: number,
    memoryTypes?: string[]
  ): Promise<VectorCandidate[]> {
    let whereClause = '';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause = 'WHERE m.memoryType IN $memoryTypes';
    }

    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      
      // Calculate name embedding score
      WITH m,
           CASE WHEN m.nameEmbedding IS NOT NULL 
                THEN gds.similarity.cosine(m.nameEmbedding, $queryVector) 
                ELSE 0.0 END AS nameScore
      
      // Calculate best observation embedding score
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      WITH m, nameScore,
           CASE WHEN o.embedding IS NOT NULL 
                THEN gds.similarity.cosine(o.embedding, $queryVector) 
                ELSE 0.0 END AS obsScore
      
      // Get the maximum score between name and all observations
      WITH m, nameScore, max(obsScore) AS maxObsScore
      WITH m, CASE WHEN nameScore >= coalesce(maxObsScore, 0.0) 
                   THEN nameScore 
                   ELSE coalesce(maxObsScore, 0.0) END AS bestScore
      
      WHERE bestScore >= $threshold
      ORDER BY bestScore DESC
      LIMIT $limit
      RETURN m.id as id, bestScore as score
    `;

    const result = await this.session.run(cypher, {
      queryVector,
      threshold,
      limit: neo4j.int(limit),
      memoryTypes
    });

    return result.records.map(record => ({
      id: record.get('id'),
      score: record.get('score')
    }));
  }

  private async searchInMemory(
    queryVector: Vector,
    limit: number,
    threshold: number,
    memoryTypes?: string[]
  ): Promise<VectorCandidate[]> {
    let whereClause = '';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause = 'WHERE m.memoryType IN $memoryTypes';
    }

    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      RETURN m.id as id,
             m.nameEmbedding as nameEmbedding,
             collect(o.embedding) as observationEmbeddings
    `;

    const result = await this.session.run(cypher, { memoryTypes });

    const similarities = result.records
      .map(record => {
        const id = record.get('id');
        const nameEmbedding = record.get('nameEmbedding');
        const obsEmbeddings = (record.get('observationEmbeddings') || [])
          .filter((emb: any) => emb !== null);

        let bestScore = 0;

        // Check name embedding first
        if (nameEmbedding && Array.isArray(nameEmbedding)) {
          bestScore = Math.max(bestScore, this.cosineSimilarity(queryVector, nameEmbedding));
        }

        // Check observation embeddings
        for (const obsEmbedding of obsEmbeddings) {
          if (obsEmbedding && Array.isArray(obsEmbedding)) {
            bestScore = Math.max(bestScore, this.cosineSimilarity(queryVector, obsEmbedding));
          }
        }

        return { id, score: bestScore };
      })
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return similarities;
  }

  private async detectGDSSupport(): Promise<boolean> {
    if (this.gdsSupport !== null) {
      return this.gdsSupport;
    }

    try {
      await this.session.run(`RETURN gds.similarity.cosine([0.1, 0.2], [0.2, 0.3]) AS test`);
      this.gdsSupport = true;
    } catch {
      this.gdsSupport = false;
    }

    return this.gdsSupport;
  }

  private cosineSimilarity(a: Vector, b: Vector): number {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
      return 0;
    }

    try {
      let dotProduct = 0;
      let magnitudeA = 0;
      let magnitudeB = 0;

      for (let i = 0; i < a.length; i++) {
        const valA = a[i];
        const valB = b[i];

        if (typeof valA !== 'number' || typeof valB !== 'number' || 
            isNaN(valA) || isNaN(valB) || !isFinite(valA) || !isFinite(valB)) {
          continue;
        }

        dotProduct += valA * valB;
        magnitudeA += valA * valA;
        magnitudeB += valB * valB;
      }

      magnitudeA = Math.sqrt(magnitudeA);
      magnitudeB = Math.sqrt(magnitudeB);

      if (magnitudeA === 0 || magnitudeB === 0 || !isFinite(magnitudeA) || !isFinite(magnitudeB)) {
        return 0;
      }

      const similarity = dotProduct / (magnitudeA * magnitudeB);
      return Math.max(-1, Math.min(1, similarity));
    } catch {
      return 0;
    }
  }
}
