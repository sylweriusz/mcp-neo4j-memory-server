/**
 * Relation Repository - Enhanced Relationship Management
 * THE IMPLEMENTOR'S RULE: Relations are first-class citizens, not afterthoughts
 * Single responsibility: Memory relationship persistence and enhanced metadata
 */

import { Session } from 'neo4j-driver';
import { MCPDatabaseError, MCPValidationError, MCPErrorCodes } from '../../errors';

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
    try {
      const result = await session.run(`
        MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
        CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)
        RETURN from, to`,
        { fromId, toId, relationType }
      );
      
      if (result.records.length === 0) {
        throw new MCPDatabaseError(
          `Failed to create relation: one or both memories do not exist`,
          MCPErrorCodes.RESOURCE_NOT_FOUND,
          { fromId, toId, relationType }
        );
      }
    } catch (error) {
      if (error instanceof MCPDatabaseError) {
        throw error;
      }
      
      if (error instanceof Error && error.message.includes('ServiceUnavailable')) {
        throw new MCPDatabaseError(
          'Database service unavailable',
          MCPErrorCodes.DATABASE_UNAVAILABLE
        );
      }
      
      throw new MCPDatabaseError(
        `Failed to create relation: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED,
        { fromId, toId, relationType }
      );
    }
  }

  /**
   * Create enhanced relation with full metadata (GDD v2.3.1+)
   */
  async createEnhancedRelation(session: Session, request: EnhancedRelationRequest): Promise<void> {
    try {
      const result = await session.run(`
        MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
        CREATE (from)-[:RELATES_TO {
          relationType: $relationType,
          strength: $strength,
          source: $source,
          createdAt: $createdAt
        }]->(to)
        RETURN from, to`, 
        request
      );
      
      if (result.records.length === 0) {
        throw new MCPDatabaseError(
          `Failed to create enhanced relation: one or both memories do not exist`,
          MCPErrorCodes.RESOURCE_NOT_FOUND,
          { fromId: request.fromId, toId: request.toId, relationType: request.relationType }
        );
      }
    } catch (error) {
      if (error instanceof MCPDatabaseError) {
        throw error;
      }
      
      if (error instanceof Error) {
        if (error.message.includes('ConstraintValidationFailed')) {
          throw new MCPValidationError(
            `Relation already exists between ${request.fromId} and ${request.toId}`,
            MCPErrorCodes.DUPLICATE_RELATION,
            { fromId: request.fromId, toId: request.toId, relationType: request.relationType }
          );
        }
        
        if (error.message.includes('ServiceUnavailable')) {
          throw new MCPDatabaseError(
            'Database service unavailable',
            MCPErrorCodes.DATABASE_UNAVAILABLE
          );
        }
      }
      
      throw new MCPDatabaseError(
        `Failed to create enhanced relation: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED,
        request
      );
    }
  }

  /**
   * Update enhanced relation metadata (GDD v3.0)
   * Zero-fallback: Relation must exist or operation fails
   */
  async updateEnhancedRelation(session: Session, request: EnhancedRelationRequest): Promise<boolean> {
    try {
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
      
      const updated = result.records[0]?.get('updated') || false;
      
      if (!updated) {
        throw new MCPDatabaseError(
          `Relation not found: ${request.fromId} → ${request.toId} (${request.relationType})`,
          MCPErrorCodes.RESOURCE_NOT_FOUND,
          { fromId: request.fromId, toId: request.toId, relationType: request.relationType }
        );
      }
      
      return updated;
    } catch (error) {
      if (error instanceof MCPDatabaseError) {
        throw error;
      }
      
      if (error instanceof Error && error.message.includes('ServiceUnavailable')) {
        throw new MCPDatabaseError(
          'Database service unavailable',
          MCPErrorCodes.DATABASE_UNAVAILABLE
        );
      }
      
      throw new MCPDatabaseError(
        `Failed to update relation: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED,
        request
      );
    }
  }

  /**
   * Delete relation by type
   */
  async deleteRelation(session: Session, fromId: string, toId: string, relationType: string): Promise<void> {
    try {
      const result = await session.run(`
        MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
        DELETE r
        RETURN count(r) > 0 as deleted`,
        { fromId, toId, relationType }
      );
      
      const deleted = result.records[0]?.get('deleted') || false;
      
      if (!deleted) {
        throw new MCPDatabaseError(
          `Relation not found: ${fromId} → ${toId} (${relationType})`,
          MCPErrorCodes.RESOURCE_NOT_FOUND,
          { fromId, toId, relationType }
        );
      }
    } catch (error) {
      if (error instanceof MCPDatabaseError) {
        throw error;
      }
      
      if (error instanceof Error && error.message.includes('ServiceUnavailable')) {
        throw new MCPDatabaseError(
          'Database service unavailable',
          MCPErrorCodes.DATABASE_UNAVAILABLE
        );
      }
      
      throw new MCPDatabaseError(
        `Failed to delete relation: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED,
        { fromId, toId, relationType }
      );
    }
  }

}
