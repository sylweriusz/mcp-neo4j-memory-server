/**
 * Core Memory Repository - Pure CRUD Implementation
 * THE IMPLEMENTOR'S RULE: Memory CRUD without graph context bloat
 * Single responsibility: Memory node persistence operations
 */

import { Session } from 'neo4j-driver';
import { Memory } from '../../../domain/entities/memory';

export interface CoreMemoryData {
  id: string;
  name: string;
  memoryType: string;
  metadata: Record<string, any>;
  createdAt: string;
  modifiedAt: string;
  lastAccessed: string;
}

export class CoreMemoryRepository {

  /**
   * Create memory node only (no observations, no graph context)
   */
  async createMemoryNode(session: Session, memory: Memory): Promise<Memory> {
    const cypher = `
      CREATE (m:Memory {
        id: $id,
        name: $name,
        memoryType: $memoryType,
        metadata: $metadata,
        createdAt: $createdAt,
        modifiedAt: $modifiedAt,
        lastAccessed: $lastAccessed,
        nameEmbedding: $nameEmbedding
      })
      RETURN m`;

    const result = await session.run(cypher, {
      id: memory.id,
      name: memory.name,
      memoryType: memory.memoryType,
      metadata: JSON.stringify(memory.metadata || {}),
      createdAt: this.toISOString(memory.createdAt),
      modifiedAt: this.toISOString(memory.modifiedAt),
      lastAccessed: this.toISOString(memory.lastAccessed),
      nameEmbedding: (memory as any).nameEmbedding || null
    });

    if (result.records.length === 0) {
      throw new Error('Failed to create memory node');
    }

    return memory;
  }

  /**
   * Get core memory data by IDs (no graph context, no observations)
   */
  async getCoreMemoryData(session: Session, ids: string[]): Promise<CoreMemoryData[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    // Update lastAccessed for all requested memories
    await session.run(
      'MATCH (m:Memory) WHERE m.id IN $ids SET m.lastAccessed = $timestamp',
      { ids, timestamp: new Date().toISOString() }
    );

    const cypher = `
      MATCH (m:Memory)
      WHERE m.id IN $ids
      RETURN m.id as id,
             m.name as name, 
             m.memoryType as memoryType,
             m.metadata as metadata,
             m.createdAt as createdAt,
             m.modifiedAt as modifiedAt,
             m.lastAccessed as lastAccessed
      ORDER BY m.name
    `;

    const result = await session.run(cypher, { ids });
    
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      memoryType: record.get('memoryType'),
      metadata: this.parseMetadata(record.get('metadata')),
      createdAt: record.get('createdAt'),
      modifiedAt: record.get('modifiedAt'),
      lastAccessed: record.get('lastAccessed')
    }));
  }

  /**
   * Get memories by type (core data only)
   */
  async getMemoriesByType(session: Session, memoryType: string): Promise<CoreMemoryData[]> {
    const cypher = `
      MATCH (m:Memory {memoryType: $memoryType})
      RETURN m.id as id,
             m.name as name, 
             m.memoryType as memoryType,
             m.metadata as metadata,
             m.createdAt as createdAt,
             m.modifiedAt as modifiedAt,
             m.lastAccessed as lastAccessed
      ORDER BY m.createdAt DESC
    `;

    const result = await session.run(cypher, { memoryType });
    
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      memoryType: record.get('memoryType'),
      metadata: this.parseMetadata(record.get('metadata')),
      createdAt: record.get('createdAt'),
      modifiedAt: record.get('modifiedAt'),
      lastAccessed: record.get('lastAccessed')
    }));
  }

  /**
   * Update memory node properties
   */
  async updateMemory(session: Session, memory: Memory): Promise<Memory> {
    const updateCypher = `
      MATCH (m:Memory {id: $id})
      SET m.name = $name,
          m.memoryType = $memoryType,
          m.metadata = $metadata,
          m.modifiedAt = $modifiedAt
      RETURN m`;
    
    const result = await session.run(updateCypher, {
      id: memory.id,
      name: memory.name,
      memoryType: memory.memoryType,
      metadata: JSON.stringify(memory.metadata || {}),
      modifiedAt: this.toISOString(memory.modifiedAt)
    });
    
    if (result.records.length === 0) {
      throw new Error(`Memory with id ${memory.id} not found`);
    }
    
    // Return the updated memory domain entity
    const updatedRecord = result.records[0].get('m');
    return {
      id: updatedRecord.properties.id,
      name: updatedRecord.properties.name,
      memoryType: updatedRecord.properties.memoryType,
      metadata: this.parseMetadata(updatedRecord.properties.metadata),
      createdAt: new Date(updatedRecord.properties.createdAt),
      modifiedAt: new Date(updatedRecord.properties.modifiedAt),
      lastAccessed: new Date(updatedRecord.properties.lastAccessed)
    };
  }

  /**
   * Delete memory node and all its relationships
   */
  async deleteMemory(session: Session, memoryId: string): Promise<boolean> {
    const cypher = `
      MATCH (m:Memory {id: $memoryId})
      
      // Delete observations
      OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      DETACH DELETE o
      
      WITH m
      // Delete memory relationships
      OPTIONAL MATCH (m)-[r:RELATES_TO]-()
      DELETE r
      
      WITH m
      OPTIONAL MATCH ()-[r:RELATES_TO]->(m)
      DELETE r
      
      // Delete memory
      DELETE m
      RETURN count(m) > 0 as deleted`;
    
    const result = await session.run(cypher, { memoryId });
    return result.records[0]?.get('deleted') || false;
  }

  /**
   * Check if memory exists
   */
  async memoryExists(session: Session, memoryId: string): Promise<boolean> {
    const result = await session.run(
      'MATCH (m:Memory {id: $id}) RETURN count(m) > 0 as exists',
      { id: memoryId }
    );
    return Boolean(result.records[0]?.get('exists'));
  }
  /**
   * Get filtered memories with pagination
   */
  async getFilteredMemories(session: Session, filters: {
    memoryTypes?: string[];
    limit?: number;
    offset?: number;
  }): Promise<CoreMemoryData[]> {
    const whereClauses: string[] = [];
    const params: any = { limit: filters.limit || 100, offset: filters.offset || 0 };
    
    if (filters.memoryTypes && filters.memoryTypes.length > 0) {
      whereClauses.push('m.memoryType IN $memoryTypes');
      params.memoryTypes = filters.memoryTypes;
    }
    
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      RETURN m.id as id,
             m.name as name, 
             m.memoryType as memoryType,
             m.metadata as metadata,
             m.createdAt as createdAt,
             m.modifiedAt as modifiedAt,
             m.lastAccessed as lastAccessed
      ORDER BY m.createdAt DESC
      SKIP $offset
      LIMIT $limit
    `;
    
    const result = await session.run(cypher, params);
    
    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      memoryType: record.get('memoryType'),
      metadata: this.parseMetadata(record.get('metadata')),
      createdAt: record.get('createdAt'),
      modifiedAt: record.get('modifiedAt'),
      lastAccessed: record.get('lastAccessed')
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

  private toISOString(date: Date | string | undefined): string {
    if (!date) return new Date().toISOString();
    if (typeof date === 'string') return date;
    return date.toISOString();
  }
}
