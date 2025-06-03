/**
 * Wildcard Search Service - Direct Memory Retrieval
 * Single responsibility: Handle "*" and empty queries with type filtering
 * Performance: Direct database query without semantic processing
 */

import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { EnhancedSearchResult } from '../../../types';

export class WildcardSearchService {
  constructor(private session: Session) {}

  /**
   * Execute wildcard search with graph context
   * GDD v2.2.0: Bypass semantic search for performance
   */
  async search(
    limit: number,
    includeGraphContext: boolean,
    memoryTypes?: string[]
  ): Promise<EnhancedSearchResult[]> {
    let whereClause = '';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause = ' WHERE m.memoryType IN $memoryTypes';
    }

    const cypher = includeGraphContext 
      ? this.buildWildcardWithContextQuery(whereClause)
      : this.buildBasicWildcardQuery(whereClause);

    const result = await this.session.run(cypher, {
      memoryTypes,
      limit: neo4j.int(limit)
    });

    return result.records.map(record => this.mapRecordToResult(record, includeGraphContext));
  }

  private buildBasicWildcardQuery(whereClause: string): string {
    return `
      MATCH (m:Memory)${whereClause}
      
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
      ORDER BY m.createdAt DESC
      LIMIT $limit
    `;
  }

  private buildWildcardWithContextQuery(whereClause: string): string {
    return `
      MATCH (m:Memory)${whereClause}

      // Graph context collection
      OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1:RELATES_TO*1..2]->(m)
      WHERE ancestor <> m AND ancestor.id IS NOT NULL
      WITH m, collect(DISTINCT {
        id: ancestor.id,
        name: ancestor.name,
        type: ancestor.memoryType,
        relation: rel1[-1].relationType,
        distance: length(path1),
        strength: rel1[-1].strength,
        source: rel1[-1].source,
        createdAt: rel1[-1].createdAt
      })[0..3] as ancestors

      OPTIONAL MATCH path2 = (m)-[rel2:RELATES_TO*1..2]->(descendant:Memory)
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

      // Observations with chronological ordering
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      WITH m, ancestors, descendants, o ORDER BY o.createdAt ASC
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
             [rel IN ancestors WHERE rel.id IS NOT NULL] as ancestors,
             [rel IN descendants WHERE rel.id IS NOT NULL] as descendants
      ORDER BY m.createdAt DESC
      LIMIT $limit
    `;
  }

  private mapRecordToResult(record: any, includeGraphContext: boolean): EnhancedSearchResult {
    const result: EnhancedSearchResult = {
      id: record.get('id'),
      name: record.get('name'),
      type: record.get('type'),
      observations: this.processObservations(record.get('observations') || []),
      metadata: this.parseMetadata(record.get('metadata')),
      createdAt: record.get('createdAt'),
      modifiedAt: record.get('modifiedAt'),
      lastAccessed: record.get('lastAccessed'),
      score: 1.0 // Wildcard results get perfect score
    };

    if (includeGraphContext) {
      const ancestors = record.get('ancestors') || [];
      const descendants = record.get('descendants') || [];
      
      if (ancestors.length > 0 || descendants.length > 0) {
        result.related = {
          ancestors: ancestors.length > 0 ? ancestors.map(this.convertNeo4jInteger) : undefined,
          descendants: descendants.length > 0 ? descendants.map(this.convertNeo4jInteger) : undefined
        };
      }
    }

    return result;
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

  private convertNeo4jInteger(item: any): any {
    if (item && typeof item.distance === 'object' && item.distance.toNumber) {
      return { ...item, distance: item.distance.toNumber() };
    }
    return item;
  }
}
