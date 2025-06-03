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
   * Create enhanced relation with full metadata (GDD v2.3.1+)
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

}
