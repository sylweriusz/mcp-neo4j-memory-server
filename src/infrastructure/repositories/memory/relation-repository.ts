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
   * Update enhanced relation metadata (GDD v3.0)
   * Zero-fallback: Relation must exist or operation fails
   */
  async updateEnhancedRelation(session: Session, request: EnhancedRelationRequest): Promise<boolean> {
    const result = await session.run(`
      MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
      SET r.strength = $strength,
          r.source = $source
      RETURN count(r) > 0 as updated`,
      { 
        fromId: request.fromId,
        toId: request.toId,
        relationType: request.relationType,
        strength: request.strength,
        source: request.source
      }
    );
    
    return result.records[0]?.get('updated') || false;
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
