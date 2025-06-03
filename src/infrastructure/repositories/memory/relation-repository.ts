/**
 * Relation Repository - Enhanced Relationship Management
 * THE IMPLEMENTOR'S RULE: Relations are first-class citizens, not afterthoughts
 * Single responsibility: Memory relationship persistence and enhanced metadata
 */

import { Session } from 'neo4j-driver';

export interface EnhancedRelationRequest {
  fromId: string;
  toId: string;
  relationType: string;
  strength: number;
  source: string;
  createdAt: string;
}

export class RelationRepository {

  /**
   * Create simple relation (legacy compatibility)
   */
  async createRelation(session: Session, fromId: string, toId: string, relationType: string): Promise<void> {
    await session.run(`
      MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
      CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)`,
      { fromId, toId, relationType }
    );
  }

  /**
   * Create enhanced relation with full metadata (GDD v2.1.2+)
   */
  async createEnhancedRelation(session: Session, request: EnhancedRelationRequest): Promise<void> {
    await session.run(`
      MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
      CREATE (from)-[:RELATES_TO {
        relationType: $relationType,
        strength: $strength,
        source: $source,
        createdAt: $createdAt
      }]->(to)`, request);
  }

  /**
   * Delete relation by type
   */
  async deleteRelation(session: Session, fromId: string, toId: string, relationType: string): Promise<void> {
    await session.run(`
      MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
      DELETE r`,
      { fromId, toId, relationType }
    );
  }

  /**
   * Delete all relations for memory (used during memory deletion)
   */
  async deleteAllRelationsForMemory(session: Session, memoryId: string): Promise<void> {
    // Delete outgoing relations
    await session.run(`
      MATCH (m:Memory {id: $memoryId})-[r:RELATES_TO]-()
      DELETE r`,
      { memoryId }
    );
    
    // Delete incoming relations  
    await session.run(`
      MATCH ()-[r:RELATES_TO]->(m:Memory {id: $memoryId})
      DELETE r`,
      { memoryId }
    );
  }

  /**
   * Check if relation exists
   */
  async relationExists(session: Session, fromId: string, toId: string, relationType: string): Promise<boolean> {
    const result = await session.run(`
      MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
      RETURN count(r) > 0 as exists`,
      { fromId, toId, relationType }
    );
    
    return Boolean(result.records[0]?.get('exists'));
  }

  /**
   * Get relation count for memory (for debugging/monitoring)
   */
  async getRelationCount(session: Session, memoryId: string): Promise<{ incoming: number; outgoing: number }> {
    const result = await session.run(`
      MATCH (m:Memory {id: $memoryId})
      OPTIONAL MATCH (m)-[outgoing:RELATES_TO]->()
      OPTIONAL MATCH ()-[incoming:RELATES_TO]->(m)
      RETURN count(DISTINCT outgoing) as outgoingCount, 
             count(DISTINCT incoming) as incomingCount`,
      { memoryId }
    );

    const record = result.records[0];
    return {
      outgoing: record ? record.get('outgoingCount').toNumber() : 0,
      incoming: record ? record.get('incomingCount').toNumber() : 0
    };
  }
}
