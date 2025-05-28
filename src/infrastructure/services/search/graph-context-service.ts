import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { RelatedMemory, SearchConfig } from '../../../domain/entities/search-config';

/**
 * Graph relationship traversal service - FIXED VERSION 
 * Single responsibility: graph context operations without Cartesian product
 */
export class GraphContextService {
  constructor(
    private session: Session,
    private config: SearchConfig
  ) {}

  async getGraphContext(memoryIds: string[]): Promise<Map<string, {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  }>> {
    if (memoryIds.length === 0) return new Map();

    const cypher = `
      MATCH (m:Memory)
      WHERE m.id IN $memoryIds

      // Ancestor relationships (pointing TO this memory)
      OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1:RELATES_TO*1..${this.config.maxGraphDepth}]->(m)
      WHERE ancestor <> m AND ancestor.id IS NOT NULL
      WITH m, collect(DISTINCT {
        id: ancestor.id,
        name: ancestor.name,
        type: ancestor.memoryType,
        relation: CASE WHEN size(rel1) > 0 THEN rel1[0].relationType ELSE null END,
        distance: length(path1),
        strength: CASE WHEN size(rel1) > 0 THEN rel1[0].strength ELSE null END,
        context: CASE WHEN size(rel1) > 0 THEN rel1[0].context ELSE null END,
        source: CASE WHEN size(rel1) > 0 THEN rel1[0].source ELSE null END,
        createdAt: CASE WHEN size(rel1) > 0 THEN rel1[0].createdAt ELSE null END
      })[0..${this.config.maxRelatedItems}] as rawAncestors
      WITH m, [rel IN rawAncestors WHERE rel.id IS NOT NULL] as ancestors

      // Descendant relationships (pointing FROM this memory)
      OPTIONAL MATCH path2 = (m)-[rel2:RELATES_TO*1..${this.config.maxGraphDepth}]->(descendant:Memory)
      WHERE descendant <> m AND descendant.id IS NOT NULL
      WITH m, ancestors, collect(DISTINCT {
        id: descendant.id,
        name: descendant.name,
        type: descendant.memoryType,
        relation: CASE WHEN size(rel2) > 0 THEN rel2[0].relationType ELSE null END,
        distance: length(path2),
        strength: CASE WHEN size(rel2) > 0 THEN rel2[0].strength ELSE null END,
        context: CASE WHEN size(rel2) > 0 THEN rel2[0].context ELSE null END,
        source: CASE WHEN size(rel2) > 0 THEN rel2[0].source ELSE null END,
        createdAt: CASE WHEN size(rel2) > 0 THEN rel2[0].createdAt ELSE null END
      })[0..${this.config.maxRelatedItems}] as rawDescendants
      WITH m, ancestors, [rel IN rawDescendants WHERE rel.id IS NOT NULL] as descendants

      RETURN m.id as memoryId, ancestors, descendants
    `;

    const result = await this.session.run(cypher, { memoryIds });
    const contextMap = new Map();

    for (const record of result.records) {
      const memoryId = record.get('memoryId');
      const ancestors = record.get('ancestors') || [];
      const descendants = record.get('descendants') || [];

      // Only include if we have actual relationships
      if (ancestors.length > 0 || descendants.length > 0) {
        contextMap.set(memoryId, {
          ancestors: ancestors.length > 0 ? ancestors : undefined,
          descendants: descendants.length > 0 ? descendants : undefined
        });
      }
    }

    return contextMap;
  }

  async searchWildcardWithContext(
    limit: number,
    memoryTypes?: string[]
  ): Promise<{[key: string]: any}[]> {
    let whereClause = '';
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause = ` WHERE m.memoryType IN $memoryTypes`;
    }

    // FIXED QUERY: Proper ordering in cypher - order before aggregation
    const cypher = `
      MATCH (m:Memory)${whereClause}

      // First collect observations with proper ordering - FIXED
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      WITH m, o ORDER BY o.createdAt ASC
      WITH m, 
           collect(DISTINCT {id: o.id, content: o.content, createdAt: o.createdAt}) as observationObjects

      // Then collect tags separately to avoid cross-product
      OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
      WITH m, observationObjects,
           collect(DISTINCT t.name)[0..3] as tags

      // Finally add graph context without affecting observations/tags
      OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1:RELATES_TO*1..${this.config.maxGraphDepth}]->(m)
      WHERE ancestor <> m AND ancestor.id IS NOT NULL
      WITH m, observationObjects, tags,
           collect(DISTINCT {
             id: ancestor.id,
             name: ancestor.name,
             type: ancestor.memoryType,
             relation: CASE WHEN size(rel1) > 0 THEN rel1[0].relationType ELSE null END,
             distance: length(path1),
             strength: CASE WHEN size(rel1) > 0 THEN rel1[0].strength ELSE null END,
             context: CASE WHEN size(rel1) > 0 THEN rel1[0].context ELSE null END,
             source: CASE WHEN size(rel1) > 0 THEN rel1[0].source ELSE null END,
             createdAt: CASE WHEN size(rel1) > 0 THEN rel1[0].createdAt ELSE null END
           })[0..${this.config.maxRelatedItems}] as ancestors

      OPTIONAL MATCH path2 = (m)-[rel2:RELATES_TO*1..${this.config.maxGraphDepth}]->(descendant:Memory)
      WHERE descendant <> m AND descendant.id IS NOT NULL
      WITH m, observationObjects, tags, ancestors,
           collect(DISTINCT {
             id: descendant.id,
             name: descendant.name,
             type: descendant.memoryType,
             relation: CASE WHEN size(rel2) > 0 THEN rel2[0].relationType ELSE null END,
             distance: length(path2),
             strength: CASE WHEN size(rel2) > 0 THEN rel2[0].strength ELSE null END,
             context: CASE WHEN size(rel2) > 0 THEN rel2[0].context ELSE null END,
             source: CASE WHEN size(rel2) > 0 THEN rel2[0].source ELSE null END,
             createdAt: CASE WHEN size(rel2) > 0 THEN rel2[0].createdAt ELSE null END
           })[0..${this.config.maxRelatedItems}] as descendants

      RETURN m.id as id,
             m.name as name,
             m.memoryType as type,
             m.metadata as metadata,
             m.nameEmbedding as embedding,
             [obs IN observationObjects WHERE obs.content IS NOT NULL | obs] as observationObjects,
             tags,
             [rel IN ancestors WHERE rel.id IS NOT NULL] as ancestors,
             [rel IN descendants WHERE rel.id IS NOT NULL] as descendants
      LIMIT $limit
    `;

    const actualLimit = Math.floor(limit); // Ensure integer for Neo4j
    
    const result = await this.session.run(cypher, {
      memoryTypes,
      limit: neo4j.int(actualLimit)
    });

    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      type: record.get('type'),
      metadata: JSON.parse(record.get('metadata') || '{}'),
      embedding: record.get('embedding'),
      observationObjects: record.get('observationObjects'),
      tags: record.get('tags') || [],
      ancestors: record.get('ancestors') || [],
      descendants: record.get('descendants') || []
    }));
  }
}
