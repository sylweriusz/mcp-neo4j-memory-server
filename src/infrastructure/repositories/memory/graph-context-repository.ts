/**
 * Graph Context Repository - Single Responsibility Extract
 * THE IMPLEMENTOR'S RULE: Graph traversal logic extracted ONCE, used everywhere
 * Single responsibility: Memory relationship graph context retrieval
 */

import { Session } from 'neo4j-driver';

export interface RelatedMemoryData {
  id: string;
  name: string;
  type: string;
  relation: string;
  distance: any; // Neo4j Integer
  strength?: number;
  source?: string;
  createdAt?: string;
}

export interface GraphContext {
  ancestors: RelatedMemoryData[];
  descendants: RelatedMemoryData[];
}

export class GraphContextRepository {
  
  /**
   * Get graph context for single memory ID
   */
  async getMemoryContext(session: Session, memoryId: string): Promise<GraphContext> {
    const cypher = `
      MATCH (m:Memory {id: $memoryId})
      
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

      RETURN ancestors, descendants
    `;

    const result = await session.run(cypher, { memoryId });
    
    if (result.records.length === 0) {
      return { ancestors: [], descendants: [] };
    }

    const record = result.records[0];
    return {
      ancestors: this.processRelatedMemories(record.get('ancestors') || []),
      descendants: this.processRelatedMemories(record.get('descendants') || [])
    };
  }

  /**
   * Get graph context for multiple memory IDs
   * Performance optimization: single query instead of N queries
   */
  async getBatchContext(session: Session, memoryIds: string[]): Promise<Map<string, GraphContext>> {
    if (memoryIds.length === 0) {
      return new Map();
    }

    const cypher = `
      MATCH (m:Memory)
      WHERE m.id IN $memoryIds
      
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

      RETURN m.id as memoryId, ancestors, descendants
    `;

    const result = await session.run(cypher, { memoryIds });
    
    const contextMap = new Map<string, GraphContext>();
    
    for (const record of result.records) {
      const memoryId = record.get('memoryId');
      contextMap.set(memoryId, {
        ancestors: this.processRelatedMemories(record.get('ancestors') || []),
        descendants: this.processRelatedMemories(record.get('descendants') || [])
      });
    }

    return contextMap;
  }

  /**
   * Process related memories data with Neo4j integer conversion
   */
  private processRelatedMemories(relatedData: any[]): RelatedMemoryData[] {
    return relatedData
      .filter((data: any) => data.id !== null)
      .map((data: any) => ({
        ...data,
        distance: data.distance ? this.convertNeo4jInteger(data.distance) : 0
      }));
  }

  private convertNeo4jInteger(value: any): number {
    if (typeof value === 'number') return value;
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return 0;
  }
}
