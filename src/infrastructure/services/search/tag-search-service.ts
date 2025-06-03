import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { calculateEmbedding } from '../../utilities';
import { VectorSupport } from '../../../domain/entities/search-config';
import { SearchCapabilities } from './metadata-search-service';

/**
 * Tag Search Service - ZERO FALLBACK ARCHITECTURE
 * Single responsibility: tag-based search operations
 * THE IMPLEMENTOR'S FIX: Corrected logic inversion bug
 */
export class TagSearchService {
  constructor(private session: Session) {}

  /**
   * Semantic tag search - FIXED CAPABILITY LOGIC
   * NO FALLBACK: If vector support unavailable, method throws clear error
   */
  async searchByTagsSemantic(
    query: string,
    limit: number,
    threshold: number = 0.6,
    memoryTypes?: string[],
    capabilities?: SearchCapabilities
  ): Promise<string[]> {
    if (!capabilities) {
      throw new Error('SearchCapabilities required for semantic tag search');
    }
    
    // THE IMPLEMENTOR'S FIX: Corrected logic - throw when NO vector support
    if (capabilities.hasVectorSupport.none) {
      throw new Error('Semantic tag search requires vector support (Enterprise Edition or GDS plugin)');
    }

    const queryEmbedding = await calculateEmbedding(query);
    
    let whereClause = 'WHERE t.embedding IS NOT NULL';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }

    let similarityFunction: string;
    if (capabilities.hasVectorSupport.enterprise) {
      similarityFunction = 'vector.similarity(t.embedding, $queryEmbedding)';
    } else if (capabilities.hasVectorSupport.gds) {
      similarityFunction = 'gds.similarity.cosine(t.embedding, $queryEmbedding)';
    } else {
      throw new Error('Vector support detection failed - invalid state');
    }

    const cypher = `
      MATCH (m:Memory)-[:HAS_TAG]->(t:Tag)
      ${whereClause}
      WITH m, t, ${similarityFunction} AS similarity
      WHERE similarity >= $threshold
      WITH DISTINCT m, MAX(similarity) as maxSim
      ORDER BY maxSim DESC
      LIMIT $limit
      RETURN m.id as id
    `;

    const result = await this.session.run(cypher, { 
      queryEmbedding,
      threshold,
      memoryTypes,
      limit: neo4j.int(limit)
    });

    return result.records
      .map(record => record.get('id'))
      .filter(id => id != null);
  }

  /**
   * String-based tag search - Always available, no dependencies
   */
  async searchByTagsString(
    query: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<string[]> {
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    if (queryWords.length === 0) return [];

    let whereClause = 'WHERE ANY(word IN $queryWords WHERE t.name CONTAINS word)';
    
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }

    const cypher = `
      MATCH (m:Memory)-[:HAS_TAG]->(t:Tag)
      ${whereClause}
      WITH DISTINCT m
      RETURN m.id as id
      ORDER BY m.name
      LIMIT $limit
    `;

    const result = await this.session.run(cypher, { 
      queryWords,
      memoryTypes,
      limit: neo4j.int(limit)
    });

    return result.records
      .map(record => record.get('id'))
      .filter(id => id != null);
  }

  /**
   * Intelligent tag search - THE IMPLEMENTOR'S CORRECTED LOGIC
   * NO HYBRID FALLBACKS: Choose one strategy based on capabilities
   */
  async searchByTags(
    query: string,
    limit: number,
    memoryTypes?: string[],
    capabilities?: SearchCapabilities
  ): Promise<string[]> {
    if (!capabilities) {
      throw new Error('SearchCapabilities required for intelligent tag search');
    }
    
    // THE IMPLEMENTOR'S FIX: Corrected capability detection
    // If system HAS vector support (none=false), use semantic search
    // If system has NO vector support (none=true), use string search
    if (capabilities.hasVectorSupport.none) {
      // No vector support - use string matching
      return await this.searchByTagsString(query, limit, memoryTypes);
    } else {
      // Vector support available - use semantic search
      try {
        return await this.searchByTagsSemantic(query, limit, 0.6, memoryTypes, capabilities);
      } catch (error) {
        // If semantic search fails with vector support available, that's a real error
        throw new Error(`Semantic tag search failed despite vector support: ${error.message}`);
      }
    }
  }
}
