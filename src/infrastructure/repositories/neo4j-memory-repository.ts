/**
 * Neo4j Memory Repository Implementation - CLEAN VERSION
 * Single responsibility: Memory persistence with Neo4j
 * CLEAN ARCHITECTURE - No business logic, just data persistence
 */

import { Memory } from '../../domain/entities/memory';
import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { SessionFactory } from '../database/session-factory';
import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { generateCompactId } from '../../id_generator';

export class Neo4jMemoryRepository implements MemoryRepository {
  constructor(private sessionFactory: SessionFactory) {}

  async create(memory: Memory): Promise<Memory> {
    return await this.sessionFactory.withSession(async (session: Session) => {
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
        })`;

      await session.run(cypher, {
        id: memory.id,
        name: memory.name,
        memoryType: memory.memoryType,
        metadata: JSON.stringify(memory.metadata || {}),
        createdAt: memory.createdAt ? memory.createdAt.toISOString() : new Date().toISOString(),
        modifiedAt: memory.modifiedAt ? memory.modifiedAt.toISOString() : new Date().toISOString(),
        lastAccessed: memory.lastAccessed ? memory.lastAccessed.toISOString() : new Date().toISOString(),
        nameEmbedding: (memory as any).nameEmbedding || null
      });

      // Create Tag nodes and HAS_TAG relationships (GDD compliant)
      if (memory.tags && memory.tags.length > 0) {
        for (const tagName of memory.tags) {
          await session.run(`
            MERGE (t:Tag {name: $tagName})
            WITH t
            MATCH (m:Memory {id: $memoryId})
            CREATE (m)-[:HAS_TAG {createdAt: $timestamp, source: "system"}]->(t)
          `, { 
            tagName, 
            memoryId: memory.id, 
            timestamp: new Date().toISOString() 
          });
        }
      }

      // Create observations if they exist
      if (memory.observations && memory.observations.length > 0) {
        for (const obs of memory.observations) {
          await this.addSingleObservation(session, memory.id, obs.content);
        }
      }

      return memory;
    });
  }
  async findById(id: string): Promise<Memory | null> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (m:Memory {id: $id})
        SET m.lastAccessed = $timestamp
        WITH m
        
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
          context: rel1[0].context,
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
          context: rel2[0].context,
          source: rel2[0].source,
          createdAt: rel2[0].createdAt
        })[0..3] as descendants

        // Core content with ordered observations and tags
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
        WITH m, ancestors, descendants, o, collect(DISTINCT t.name) as tags ORDER BY o.createdAt ASC
        RETURN m, ancestors, descendants, tags, collect({
          id: o.id,
          content: o.content,
          createdAt: o.createdAt
        }) as observations`;

      const result = await session.run(cypher, { id, timestamp: new Date().toISOString() });
      
      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const memoryNode = record.get('m');
      const ancestors = record.get('ancestors') || [];
      const descendants = record.get('descendants') || [];
      const observations = record.get('observations') || [];
      const tags = record.get('tags') || [];

      return {
        id: memoryNode.properties.id,
        name: memoryNode.properties.name,
        memoryType: memoryNode.properties.memoryType,
        metadata: memoryNode.properties.metadata ? JSON.parse(memoryNode.properties.metadata) : {},
        createdAt: memoryNode.properties.createdAt,
        modifiedAt: memoryNode.properties.modifiedAt,
        lastAccessed: memoryNode.properties.lastAccessed,
        tags: tags,
        observations: observations.filter(obs => obs.content).map(obs => ({
          id: obs.id,
          content: obs.content,
          createdAt: obs.createdAt
        })),
        related: {
          ancestors: ancestors
            .filter(a => a.id !== null)
            .map(a => ({
              ...a,
              distance: a.distance ? a.distance.toNumber() : 0
            })),
          descendants: descendants
            .filter(d => d.id !== null)
            .map(d => ({
              ...d,
              distance: d.distance ? d.distance.toNumber() : 0
            }))
        }
      };
    });
  }

  async findByIds(ids: string[]): Promise<Memory[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (m:Memory)
        WHERE m.id IN $ids
        SET m.lastAccessed = $timestamp
        WITH m
        
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
          context: rel1[0].context,
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
          context: rel2[0].context,
          source: rel2[0].source,
          createdAt: rel2[0].createdAt
        })[0..3] as descendants

        // Core content with ordered observations and tags
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
        WITH m, ancestors, descendants, o, collect(DISTINCT t.name) as tags ORDER BY o.createdAt ASC
        RETURN m, ancestors, descendants, tags, collect({
          id: o.id,
          content: o.content,
          createdAt: o.createdAt
        }) as observations`;

      const result = await session.run(cypher, { 
        ids, 
        timestamp: new Date().toISOString() 
      });
      
      return result.records.map(record => {
        const memoryNode = record.get('m');
        const ancestors = record.get('ancestors') || [];
        const descendants = record.get('descendants') || [];
        const observations = record.get('observations') || [];
        const tags = record.get('tags') || [];

        return {
          id: memoryNode.properties.id,
          name: memoryNode.properties.name,
          memoryType: memoryNode.properties.memoryType,
          metadata: memoryNode.properties.metadata ? JSON.parse(memoryNode.properties.metadata) : {},
          createdAt: memoryNode.properties.createdAt,
          modifiedAt: memoryNode.properties.modifiedAt,
          lastAccessed: memoryNode.properties.lastAccessed,
          tags: tags,
          observations: observations.filter(obs => obs.content).map(obs => ({
            id: obs.id,
            content: obs.content,
            createdAt: obs.createdAt
          })),
          related: {
            ancestors: ancestors
              .filter(a => a.id !== null)
              .map(a => ({
                ...a,
                distance: a.distance ? a.distance.toNumber() : 0
              })),
            descendants: descendants
              .filter(d => d.id !== null)
              .map(d => ({
                ...d,
                distance: d.distance ? d.distance.toNumber() : 0
              }))
          }
        };
      });
    });
  }

  private async addSingleObservation(session: Session, memoryId: string, content: string): Promise<void> {
    const obsId = generateCompactId(); // POPRAWKA: używamy centralnej funkcji BASE85
    await session.run(`
      MATCH (m:Memory {id: $memoryId})
      CREATE (o:Observation {
        id: $obsId,
        content: $content,
        createdAt: $timestamp
      })
      CREATE (m)-[:HAS_OBSERVATION]->(o)
    `, { memoryId, obsId, content, timestamp: new Date().toISOString() });
  }

  // PROPER IMPLEMENTATION STUBS - fail fast instead of lying
  async findByType(memoryType: string): Promise<Memory[]> {
    throw new Error("findByType not implemented - implement or remove interface requirement");
  }
  
  async update(memory: Memory): Promise<Memory> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // First update the basic memory properties
      const updateCypher = `
        MATCH (m:Memory {id: $id})
        SET m.name = $name,
            m.memoryType = $memoryType,
            m.metadata = $metadata,
            m.modifiedAt = $modifiedAt
        RETURN m
      `;
      
      const result = await session.run(updateCypher, {
        id: memory.id,
        name: memory.name,
        memoryType: memory.memoryType,
        metadata: memory.metadata ? JSON.stringify(memory.metadata) : null,
        modifiedAt: memory.modifiedAt
      });
      
      if (result.records.length === 0) {
        throw new Error(`Memory with id ${memory.id} not found`);
      }

      // Handle tags properly according to GDD architecture
      if (memory.tags && memory.tags.length > 0) {
        // Delete existing tag relationships
        await session.run(`
          MATCH (m:Memory {id: $memoryId})-[r:HAS_TAG]->()
          DELETE r
        `, { memoryId: memory.id });

        // Create new tags and relationships
        for (const tagName of memory.tags) {
          await session.run(`
            MERGE (t:Tag {name: $tagName})
            WITH t
            MATCH (m:Memory {id: $memoryId})
            CREATE (m)-[:HAS_TAG {createdAt: $timestamp, source: "system"}]->(t)
          `, { 
            tagName, 
            memoryId: memory.id, 
            timestamp: new Date().toISOString() 
          });
        }
      }
      
      // Return updated memory with full context
      return await this.findById(memory.id) || memory;
    });
  }
  
  async delete(id: string): Promise<boolean> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // Single atomic operation to delete everything related to the memory
      const cypher = `
        MATCH (m:Memory {id: $memoryId})
        
        // Collect and delete observations
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        DETACH DELETE o
        
        // Delete all relationships involving this memory
        WITH m
        OPTIONAL MATCH (m)-[r:HAS_TAG]->()
        DELETE r
        
        WITH m  
        OPTIONAL MATCH (m)-[r:RELATES_TO]-()
        DELETE r
        
        WITH m
        OPTIONAL MATCH ()-[r:RELATES_TO]->(m)
        DELETE r
        
        // Finally delete the memory node itself
        WITH m
        DELETE m
        RETURN 1 as deleted
      `;
      
      const result = await session.run(cypher, { memoryId: id });
      return result.records.length > 0;
    });
  }
  
  async exists(id: string): Promise<boolean> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (m:Memory {id: $id})
        RETURN count(m) > 0 as exists
      `;
      
      const result = await session.run(cypher, { id });
      const exists = result.records[0]?.get('exists');
      
      return Boolean(exists);
    });
  }
  
  async findWithFilters(filters: any): Promise<Memory[]> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // Build dynamic WHERE clause based on filters
      const whereClauses = [];
      const params: any = {};
      
      if (filters.memoryType) {
        whereClauses.push('m.memoryType = $memoryType');
        params.memoryType = filters.memoryType;
      }
      
      if (filters.tags && filters.tags.length > 0) {
        whereClauses.push('ANY(tag IN m.tags WHERE tag IN $tags)');
        params.tags = filters.tags;
      }
      
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      
      const cypher = `
        MATCH (m:Memory)
        ${whereClause}
        
        // Core content with ordered observations
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        WITH m, o ORDER BY o.createdAt ASC
        RETURN m, collect({
          id: o.id,
          content: o.content,
          createdAt: o.createdAt
        }) as observations
        LIMIT 100`;
      
      const result = await session.run(cypher, params);
      
      return result.records.map(record => {
        const memoryNode = record.get('m');
        const observations = record.get('observations') || [];
        
        return {
          id: memoryNode.properties.id,
          name: memoryNode.properties.name,
          memoryType: memoryNode.properties.memoryType,
          metadata: memoryNode.properties.metadata ? JSON.parse(memoryNode.properties.metadata) : {},
          createdAt: memoryNode.properties.createdAt,
          modifiedAt: memoryNode.properties.modifiedAt,
          lastAccessed: memoryNode.properties.lastAccessed,
          tags: memoryNode.properties.tags || [],
          observations: observations.filter(obs => obs.content),
          related: {
            ancestors: [],
            descendants: []
          }
        };
      });
    });
  }
  
  async addObservations(memoryId: string, observations: string[]): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      for (const content of observations) {
        await this.addSingleObservation(session, memoryId, content);
      }
    });
  }
  
  async deleteObservations(memoryId: string, observations: string[]): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
        WHERE o.id IN $observations
        DETACH DELETE o`;
      
      await session.run(cypher, { memoryId, observations });
    });
  }
  
  async createRelation(fromId: string, toId: string, relationType: string): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
        CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)`;
      
      await session.run(cypher, { fromId, toId, relationType });
    });
  }

  // BUG #3 FIX: Enhanced relation creation with full metadata support
  async createEnhancedRelation(request: {
    fromId: string;
    toId: string;
    relationType: string;
    strength: number;
    context: string[];
    source: string;
    createdAt: string;
  }): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
        CREATE (from)-[:RELATES_TO {
          relationType: $relationType,
          strength: $strength,
          context: $context,
          source: $source,
          createdAt: $createdAt
        }]->(to)`;
      
      await session.run(cypher, {
        fromId: request.fromId,
        toId: request.toId,
        relationType: request.relationType,
        strength: request.strength,
        context: request.context,
        source: request.source,
        createdAt: request.createdAt
      });
    });
  }
  
  async deleteRelation(fromId: string, toId: string, relationType: string): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      const cypher = `
        MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
        DELETE r`;
      
      await session.run(cypher, { fromId, toId, relationType });
    });
  }
}
