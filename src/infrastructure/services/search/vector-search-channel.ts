/**
 * Vector Search Channel - Semantic Similarity Engine 
 * Single responsibility: Vector similarity operations using Neo4j GDS
 * 
 * CORRECTED IMPLEMENTATION: GDS is REQUIRED, not optional
 * ZERO-FALLBACK POLICY: If GDS fails, search fails. Period.
 * 
 * Based on system documentation:
 * - DozerDB setup includes GDS plugin installation
 * - GDS functions are documented as standard features
 * - Verification command provided: RETURN gds.similarity.cosine([1,2,3], [2,3,4])
 */

import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { calculateEmbedding, Vector } from '../../utilities';
import { MCPServiceError, MCPErrorCodes } from '../../errors';

export interface VectorCandidate {
  id: string;
  score: number;
}

export class VectorSearchChannel {
  private gdsVerified: boolean | null = null;

  constructor(private session: Session) {}

  /**
   * Execute vector similarity search using Neo4j GDS
   * ZERO-FALLBACK: Either GDS works or we fail fast with setup instructions
   */
  async search(
    query: string,
    limit: number,
    threshold: number,
    memoryTypes?: string[]
  ): Promise<VectorCandidate[]> {
    // Ensure GDS is available before proceeding
    await this.ensureGDSAvailable();
    
    const queryVector = await calculateEmbedding(query);
    return this.searchWithGDS(queryVector, limit, threshold, memoryTypes);
  }

  /**
   * Verify GDS is properly configured
   */
  private async ensureGDSAvailable(): Promise<void> {
    if (this.gdsVerified === true) {
      return; // Already verified in this session
    }

    try {
      // Use the exact verification command from README.NEO4J.md
      const result = await this.session.run(
        'RETURN gds.similarity.cosine([1,2,3], [2,3,4]) AS similarity'
      );
      
      const similarity = result.records[0]?.get('similarity');
      if (typeof similarity !== 'number') {
        throw new MCPServiceError(
          'GDS function returned invalid result',
          MCPErrorCodes.SERVICE_MISCONFIGURED,
          { service: 'neo4j-gds', expectedType: 'number', actualType: typeof similarity }
        );
      }
      
      this.gdsVerified = true;
      // Silent verification - no operational noise
      
    } catch (error) {
      this.gdsVerified = false;
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // ZERO-FALLBACK: Provide clear setup instructions instead of silently degrading
      throw new MCPServiceError(
        'Neo4j Graph Data Science (GDS) plugin is required but not installed',
        MCPErrorCodes.REQUIRED_SERVICE_MISSING,
        { 
          service: 'neo4j-gds',
          installUrl: 'https://dozerdb.org/',
          verifyCommand: 'RETURN gds.similarity.cosine([1,2,3], [2,3,4])',
          originalError: errorMessage
        }
      );
    }
  }

  /**
   * Execute vector search using GDS plugin
   * ASSUMES GDS is available - ensureGDSAvailable() must be called first
   */
  private async searchWithGDS(
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
      
      // Calculate name embedding score using GDS
      WITH m,
           CASE WHEN m.nameEmbedding IS NOT NULL 
                THEN gds.similarity.cosine(m.nameEmbedding, $queryVector) 
                ELSE 0.0 END AS nameScore
      
      // Calculate best observation embedding score using GDS
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

    try {
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
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's a GDS-specific error
      if (errorMessage.includes('gds.similarity') || errorMessage.includes('Unknown function')) {
        throw new MCPServiceError(
          'GDS vector search failed. The plugin may have been disabled or removed',
          MCPErrorCodes.SERVICE_UNAVAILABLE,
          {
            service: 'neo4j-gds',
            originalError: errorMessage,
            verifyCommand: 'RETURN gds.similarity.cosine([1,2,3], [2,3,4])'
          }
        );
      }
      
      // Re-throw other errors with context
      throw new MCPServiceError(
        `Vector search query failed: ${errorMessage}`,
        MCPErrorCodes.SERVICE_ERROR,
        { service: 'vector-search', query: 'gds-similarity' }
      );
    }
  }

  /**
   * Get GDS verification status for monitoring
   */
  isGDSVerified(): boolean | null {
    return this.gdsVerified;
  }
}
