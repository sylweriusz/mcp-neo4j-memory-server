import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { EnhancedSearchResult } from '../../../domain/entities/search-config';

/**
 * Metadata and fulltext search service
 * Single responsibility: text-based search operations
 */
export class MetadataSearchService {
  constructor(private session: Session) {}

  async searchByMetadata(
    query: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<{ exactMatches: string[]; fulltextMatches: string[] }> {
    try {
      const exactMatches = await this.findExactMatches(query, limit, memoryTypes);
      const fulltextMatches = await this.findFulltextMatches(query, limit, memoryTypes);
      
      return { exactMatches, fulltextMatches };
    } catch (error) {
      console.warn(`Metadata search failed: ${error}`);
      return { exactMatches: [], fulltextMatches: [] };
    }
  }

  private async findExactMatches(
    query: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<string[]> {
    let whereClause = 'WHERE (m.name CONTAINS $query OR m.metadata CONTAINS $query)';
    
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }

    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      RETURN m.id as id, m.name as name
      ORDER BY name
      LIMIT $limit
    `;

    const result = await this.session.run(cypher, { 
      query: query.toLowerCase(),
      memoryTypes,
      limit: neo4j.int(limit)
    });

    return result.records.map(record => record.get('id'));
  }

  private async findFulltextMatches(
    query: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<string[]> {
    try {
      // Use fulltext index if available
      let cypher = `
        CALL db.index.fulltext.queryNodes('memory_metadata_idx', $query) 
        YIELD node, score
        WHERE node:Memory
      `;

      if (memoryTypes && memoryTypes.length > 0) {
        cypher += ' AND node.memoryType IN $memoryTypes';
      }

      cypher += `
        RETURN node.id as id
        ORDER BY score DESC
        LIMIT $limit
      `;

      const result = await this.session.run(cypher, { 
        query,
        memoryTypes,
        limit: neo4j.int(limit)
      });

      return result.records.map(record => record.get('id'));
    } catch (error) {
      // Fallback to CONTAINS if fulltext index unavailable
      console.warn('Fulltext index unavailable, using fallback search');
      return this.findExactMatches(query, limit, memoryTypes);
    }
  }

  async searchByTags(
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

    return result.records.map(record => record.get('id'));
  }
}
