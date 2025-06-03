/**
 * Exact Search Channel - Truth-First Architecture  
 * Single responsibility: Case-insensitive exact matching
 * Performance target: <100ms (GDD v2.2.0)
 */

import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

export interface ExactMatchCandidate {
  id: string;
  name: string;
  metadata: Record<string, any>;
  matchTypes: {
    exactMetadata: boolean;
    exactName: boolean;
    exactContent: boolean;
  };
}

export class ExactSearchChannel {
  constructor(private session: Session) {}

  /**
   * Execute exact match search with case-insensitive CONTAINS
   * GDD v2.2.0: All text matching uses toLower() normalization
   */
  async search(
    normalizedQuery: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<ExactMatchCandidate[]> {
    let whereClause = `
      WHERE (
        toLower(m.metadata) CONTAINS $query OR
        toLower(m.name) CONTAINS $query OR
        EXISTS {
          MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
          WHERE toLower(o.content) CONTAINS $query
        }
      )
    `;

    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }

    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      
      // Collect observations for content matching
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      WITH m, 
           collect(DISTINCT toLower(o.content)) as observationContents,
           // Match type detection
           toLower(m.metadata) CONTAINS $query as exactMetadata,
           toLower(m.name) CONTAINS $query as exactName
      
      WITH m, exactMetadata, exactName,
           any(content IN observationContents WHERE content CONTAINS $query) as exactContent
      
      RETURN m.id as id,
             m.name as name,
             m.metadata as metadata,
             exactMetadata,
             exactName,
             exactContent
      
      ORDER BY 
        CASE WHEN exactName THEN 3
             WHEN exactMetadata THEN 2  
             WHEN exactContent THEN 1
             ELSE 0 END DESC,
        m.createdAt DESC
      LIMIT $limit
    `;

    const result = await this.session.run(cypher, {
      query: normalizedQuery,
      memoryTypes,
      limit: neo4j.int(limit)
    });

    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      metadata: this.parseMetadata(record.get('metadata')),
      matchTypes: {
        exactMetadata: record.get('exactMetadata'),
        exactName: record.get('exactName'),
        exactContent: record.get('exactContent')
      }
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
}
