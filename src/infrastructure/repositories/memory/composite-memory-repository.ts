/**
 * Composite Memory Repository - Clean Architecture Assembly (Part 1)
 * THE IMPLEMENTOR'S RULE: Composition over inheritance, specialization over bloat
 * Single responsibility: Orchestrate specialized repositories into unified interface
 */

import { Memory } from '../../../domain/entities/memory';
import { MemoryRepository } from '../../../domain/repositories/memory-repository';
import { SessionFactory } from '../../database/session-factory';
import { Session } from 'neo4j-driver';

import { CoreMemoryRepository, CoreMemoryData } from './core-memory-repository';
import { GraphContextRepository, GraphContext } from './graph-context-repository';
import { ObservationRepository, ObservationData } from './observation-repository';
import { RelationRepository } from './relation-repository';

export class CompositeMemoryRepository implements MemoryRepository {
  private coreRepo: CoreMemoryRepository;
  private graphRepo: GraphContextRepository;
  private obsRepo: ObservationRepository;
  private relRepo: RelationRepository;

  constructor(private sessionFactory: SessionFactory) {
    this.coreRepo = new CoreMemoryRepository();
    this.graphRepo = new GraphContextRepository();
    this.obsRepo = new ObservationRepository();
    this.relRepo = new RelationRepository();
  }

  async create(memory: Memory): Promise<Memory> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // Create memory node
      const createdMemory = await this.coreRepo.createMemoryNode(session, memory);

      // Handle observations if provided
      if (memory.observations && memory.observations.length > 0) {
        const cleanObservations = this.validateObservations(memory.observations);
        await this.obsRepo.createObservations(session, memory.id, cleanObservations);
      }

      return createdMemory;
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
      // Get core memory data
      const coreMemories = await this.coreRepo.getCoreMemoryData(session, ids);
      
      if (coreMemories.length === 0) {
        return [];
      }

      const foundIds = coreMemories.map(m => m.id);

      // Get graph context for found memories
      const graphContextMap = await this.graphRepo.getBatchContext(session, foundIds);
      
      // Get observations for found memories
      const observationsMap = await this.obsRepo.getBatchObservations(session, foundIds);

      // Compose complete Memory objects
      return coreMemories.map(core => this.composeMemory(
        core,
        graphContextMap.get(core.id) || { ancestors: [], descendants: [] },
        observationsMap.get(core.id) || []
      ));
    });
  }

  async findByType(memoryType: string): Promise<Memory[]> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // Get core memories by type
      const coreMemories = await this.coreRepo.getMemoriesByType(session, memoryType);
      
      if (coreMemories.length === 0) {
        return [];
      }

      const memoryIds = coreMemories.map(m => m.id);

      // Get graph context and observations in parallel
      const [graphContextMap, observationsMap] = await Promise.all([
        this.graphRepo.getBatchContext(session, memoryIds),
        this.obsRepo.getBatchObservations(session, memoryIds)
      ]);

      // Compose complete Memory objects
      return coreMemories.map(core => this.composeMemory(
        core,
        graphContextMap.get(core.id) || { ancestors: [], descendants: [] },
        observationsMap.get(core.id) || []
      ));
    });
  }

  async update(memory: Memory): Promise<Memory> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      return await this.coreRepo.updateMemory(session, memory);
    });
  }

  async delete(id: string): Promise<boolean> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      return await this.coreRepo.deleteMemory(session, id);
    });
  }

  async exists(id: string): Promise<boolean> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      return await this.coreRepo.memoryExists(session, id);
    });
  }

  async findWithFilters(filters: {
    memoryTypes?: string[];
    limit?: number;
    offset?: number;
  }): Promise<Memory[]> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      // Get filtered core memories
      const coreMemories = await this.coreRepo.getFilteredMemories(session, filters);
      
      if (coreMemories.length === 0) {
        return [];
      }

      const memoryIds = coreMemories.map(m => m.id);

      // Get graph context and observations
      const [graphContextMap, observationsMap] = await Promise.all([
        this.graphRepo.getBatchContext(session, memoryIds),
        this.obsRepo.getBatchObservations(session, memoryIds)
      ]);

      // Compose complete Memory objects
      return coreMemories.map(core => this.composeMemory(
        core,
        graphContextMap.get(core.id) || { ancestors: [], descendants: [] },
        observationsMap.get(core.id) || []
      ));
    });
  }

  // ========== OBSERVATION OPERATIONS ==========

  async addObservations(memoryId: string, observations: string[]): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await this.obsRepo.createObservations(session, memoryId, observations);
    });
  }

  async deleteObservations(memoryId: string, observationIds: string[]): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await this.obsRepo.deleteObservations(session, memoryId, observationIds);
    });
  }
  // ========== RELATION OPERATIONS ==========

  async createRelation(fromId: string, toId: string, relationType: string): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await this.relRepo.createRelation(session, fromId, toId, relationType);
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
      await this.relRepo.createEnhancedRelation(session, request);
    });
  }

  async deleteRelation(fromId: string, toId: string, relationType: string): Promise<void> {
    return await this.sessionFactory.withSession(async (session: Session) => {
      await this.relRepo.deleteRelation(session, fromId, toId, relationType);
    });
  }

  // ========== PRIVATE COMPOSITION METHODS ==========

  private composeMemory(
    core: CoreMemoryData,
    graphContext: GraphContext,
    observations: ObservationData[]
  ): Memory {
    return {
      id: core.id,
      name: core.name,
      memoryType: core.memoryType,
      metadata: core.metadata,
      createdAt: core.createdAt,
      modifiedAt: core.modifiedAt,
      lastAccessed: core.lastAccessed,
      observations: observations.map(obs => ({
        id: obs.id,
        content: obs.content,
        createdAt: obs.createdAt
      })),
      related: {
        ancestors: graphContext.ancestors.map(a => ({
          ...a,
          distance: a.distance
        })),
        descendants: graphContext.descendants.map(d => ({
          ...d,
          distance: d.distance
        }))
      }
    };
  }

  private validateObservations(observations: any[]): string[] {
    return observations.map(obs => {
      if (typeof obs === 'string') {
        return obs;
      } else if (obs && typeof obs === 'object' && typeof obs.content === 'string') {
        return obs.content;
      } else {
        throw new Error('Invalid observation format: must be string or {content: string}');
      }
    });
  }
}
