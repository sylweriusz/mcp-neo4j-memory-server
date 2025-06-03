/**
 * Neo4j Memory Repository Implementation - CLEAN REFACTORED VERSION
 * Single responsibility: Memory persistence with Neo4j
 * CLEAN ARCHITECTURE - No business logic, just data persistence
 * GREYPLAN: Eliminate duplication, fix types, optimize queries
 */

import { Memory, MemoryValidator } from '../../domain/entities/memory';
import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { SessionFactory } from '../database/session-factory';
import { Session } from 'neo4j-driver';
import { generateCompactId } from '../../id_generator';
import { calculateEmbedding } from '../utilities';

interface MemoryRecord {
  id: string;
  name: string;
  memoryType: string;
  metadata: string;
  createdAt: string;
  modifiedAt: string;
  lastAccessed: string;
}

interface RelatedMemoryData {
  id: string;
  name: string;
  type: string;
  relation: string;
  distance: any; // Neo4j Integer
  strength?: number;
  source?: string;
  createdAt?: string;
}

export class Neo4jMemoryRepository implements MemoryRepository {
  constructor(private sessionFactory: SessionFactory) {}

  async create(memory: Memory): Promise<Memory> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // Create memory node
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
        throw new Error('Failed to create memory');
      }

      // Handle observations in batch - THE VETERAN'S PARANOIA: Ensure only strings pass through
      if (memory.observations && memory.observations.length > 0) {
        const cleanObservations = memory.observations.map(obs => {
          if (typeof obs === 'string') {
            return obs;
          } else if (obs && typeof obs === 'object' && typeof obs.content === 'string') {
            return obs.content;
          } else {
            throw new Error('Invalid observation format: must be string or {content: string}');
          }
        });
        await this.createObservations(session, memory.id, cleanObservations);
      }

      return memory;
    });
  }

  async findById(id: string): Promise<Memory | null> {
    const memories = await this.findByIds([id]);
    return memories.length > 0 ? memories[0] : null;
  }

  async findByIds(ids: string[]): Promise<Memory[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    return await this.sessionFactory.withSession(async (session: Session) => {
      // Update lastAccessed for all requested memories
      await session.run(
        'MATCH (m:Memory) WHERE m.id IN $ids SET m.lastAccessed = $timestamp',
        { ids, timestamp: new Date().toISOString() }
      );

      // Single comprehensive query for all data
      const cypher = `
        MATCH (m:Memory)
        WHERE m.id IN $ids
        
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

        // Core content with ordered observations
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        WITH m, ancestors, descendants, o
        ORDER BY o.createdAt ASC
        RETURN m, ancestors, descendants, collect({
          id: o.id,
          content: o.content,
          createdAt: o.createdAt
        }) as observations`;

      const result = await session.run(cypher, { ids });
      
      return result.records.map(record => this.mapRecordToMemory(record));
    });
  }

  async findByType(memoryType: string): Promise<Memory[]> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (m:Memory {memoryType: $memoryType})
        
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

        // Core content with ordered observations
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        WITH m, ancestors, descendants, o
        ORDER BY o.createdAt ASC
        RETURN m, ancestors, descendants, collect({
          id: o.id,
          content: o.content,
          createdAt: o.createdAt
        }) as observations`;

      const result = await session.run(cypher, { memoryType });
      
      return result.records.map(record => this.mapRecordToMemory(record));
    });
  }

  async update(memory: Memory): Promise<Memory> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // Update memory properties and return updated record
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
    });
  }
  
  async delete(id: string): Promise<boolean> {
    return await this.sessionFactory.withSession(async (session: Session) => {
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
      
      const result = await session.run(cypher, { memoryId: id });
      return result.records[0]?.get('deleted') || false;
    });
  }
  
  async exists(id: string): Promise<boolean> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const result = await session.run(
        'MATCH (m:Memory {id: $id}) RETURN count(m) > 0 as exists',
        { id }
      );
      return Boolean(result.records[0]?.get('exists'));
    });
  }
  
  async findWithFilters(filters: {
    memoryTypes?: string[];
    limit?: number;
    offset?: number;
  }): Promise<Memory[]> {
    return await this.sessionFactory.withSession(async (session: Session) => {
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

        // Core content with ordered observations
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        WITH m, ancestors, descendants, o
        ORDER BY o.createdAt ASC
        WITH m, ancestors, descendants, collect({
          id: o.id,
          content: o.content,
          createdAt: o.createdAt
        }) as observations
        SKIP $offset
        LIMIT $limit
        RETURN m, ancestors, descendants, observations`;
      
      const result = await session.run(cypher, params);
      
      return result.records.map(record => this.mapRecordToMemory(record));
    });
  }
  
  async addObservations(memoryId: string, observations: string[]): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await this.createObservations(session, memoryId, observations);
    });
  }
  
  async deleteObservations(memoryId: string, observationIds: string[]): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await session.run(`
        MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
        WHERE o.id IN $observationIds
        DETACH DELETE o`,
        { memoryId, observationIds }
      );
    });
  }
  
  async createRelation(fromId: string, toId: string, relationType: string): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await session.run(`
        MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
        CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)`,
        { fromId, toId, relationType }
      );
    });
  }

  async createEnhancedRelation(request: {
    fromId: string;
    toId: string;
    relationType: string;
    strength: number;
    source: string;
    createdAt: string;
  }): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await session.run(`
        MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
        CREATE (from)-[:RELATES_TO {
          relationType: $relationType,
          strength: $strength,
          source: $source,
          createdAt: $createdAt
        }]->(to)`, request);
    });
  }
  
  async deleteRelation(fromId: string, toId: string, relationType: string): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await session.run(`
        MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
        DELETE r`,
        { fromId, toId, relationType }
      );
    });
  }

  // ========== PRIVATE HELPER METHODS ==========

  private async createObservations(session: Session, memoryId: string, contents: string[]): Promise<void> {
    for (const content of contents) {
      await this.createSingleObservation(session, memoryId, content);
    }
  }

  private async createSingleObservation(session: Session, memoryId: string, content: string): Promise<void> {
    // THE VETERAN'S PARANOIA: Someone is passing objects instead of strings
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Observation content must be a non-empty string');
    }
    
    const obsId = generateCompactId();
    let embedding: number[] | null = null;
    
    try {
      embedding = await calculateEmbedding(content);
    } catch (error) {
      // Failed to calculate embedding - skip it
    }

    await session.run(`
      MATCH (m:Memory {id: $memoryId})
      CREATE (o:Observation {
        id: $obsId,
        content: $content,
        createdAt: $timestamp,
        embedding: $embedding
      })
      CREATE (m)-[:HAS_OBSERVATION]->(o)`,
      { 
        memoryId, 
        obsId, 
        content, 
        timestamp: new Date().toISOString(),
        embedding
      }
    );
  }

  private mapRecordToMemory(record: any): Memory {
    const memoryNode = record.get('m');
    const ancestors = record.get('ancestors') || [];
    const descendants = record.get('descendants') || [];
    const observations = record.get('observations') || [];

    return {
      id: memoryNode.properties.id,
      name: memoryNode.properties.name,
      memoryType: memoryNode.properties.memoryType,
      metadata: this.parseMetadata(memoryNode.properties.metadata),
      createdAt: memoryNode.properties.createdAt,
      modifiedAt: memoryNode.properties.modifiedAt,
      lastAccessed: memoryNode.properties.lastAccessed,
      observations: observations
        .filter((obs: any) => obs.content)
        .map((obs: any) => ({
          id: obs.id,
          content: obs.content,
          createdAt: obs.createdAt
        })),
      related: {
        ancestors: ancestors
          .filter((a: RelatedMemoryData) => a.id !== null)
          .map((a: RelatedMemoryData) => ({
            ...a,
            distance: a.distance ? this.convertNeo4jInteger(a.distance) : 0
          })),
        descendants: descendants
          .filter((d: RelatedMemoryData) => d.id !== null)
          .map((d: RelatedMemoryData) => ({
            ...d,
            distance: d.distance ? this.convertNeo4jInteger(d.distance) : 0
          }))
      }
    };
  }

  private convertNeo4jInteger(value: any): number {
    if (typeof value === 'number') return value;
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return 0;
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
