/**
 * Updated Memory Repository Integration Tests - Interface Compatible  
 * Architectural Decision: Updated tests to work with Memory interface pattern instead of constructor
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Neo4jMemoryRepository } from '../../src/infrastructure/repositories/neo4j-memory-repository';
import { SessionFactory } from '../../src/infrastructure/database/session-factory';
import { Neo4jDriverManager } from '../../src/infrastructure/database/neo4j-driver';
import { type Memory } from '../../src/domain/entities/memory';
import { generateCompactId } from '../../src/id_generator';

// Helper to create valid memory objects matching interface
const createTestMemory = (overrides: Partial<Memory> = {}): Memory => ({
  id: generateCompactId(),
  name: 'Test Memory',
  memoryType: 'project',
  metadata: {},
  createdAt: new Date(),
  modifiedAt: new Date(),
  lastAccessed: new Date(),
  ...overrides
});

describe('Neo4j Memory Repository Integration', () => {
  let repository: Neo4jMemoryRepository;
  let sessionFactory: SessionFactory;
  let driverManager: Neo4jDriverManager;

  beforeEach(async () => {
    driverManager = new Neo4jDriverManager();
    sessionFactory = new SessionFactory(driverManager);
    repository = new Neo4jMemoryRepository(sessionFactory);
  });

  afterEach(async () => {
    await driverManager.close();
  });

  describe('create', () => {
    it('should create memory with proper GDD structure', async () => {
      const memory = createTestMemory({
        name: 'Integration Test Memory',
        memoryType: 'integration_test',
        metadata: { test: true, environment: 'vitest' },
        observations: [
          { content: 'Integration test observation 1', createdAt: new Date().toISOString() },
          { content: 'Integration test observation 2', createdAt: new Date().toISOString() }
        ]
      });

      // Add name embedding for persistence (repository expects it)
      (memory as any).nameEmbedding = new Array(384).fill(0.1);

      const result = await repository.create(memory);

      expect(result.id).toBe(memory.id);
      expect(result.name).toBe(memory.name);
      expect(result.memoryType).toBe(memory.memoryType);
      expect(result.metadata).toEqual(memory.metadata);
    });

    it('should create observations with memory', async () => {
      const memory = createTestMemory({
        name: 'Memory with Observations',
        memoryType: 'test_with_obs',
        metadata: { hasObservations: true }
      });

      // Add name embedding for persistence
      (memory as any).nameEmbedding = new Array(384).fill(0.2);

      const observationContents = [
        'First observation content',
        'Second observation content',
        'Third observation content'
      ];

      const result = await repository.create(memory);
      await repository.addObservations(memory.id, observationContents);

      // Retrieve to verify observations were added
      const retrieved = await repository.findById(memory.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.observations).toHaveLength(3);
      expect(retrieved!.observations![0].content).toBe('First observation content');
    });
  });

  describe('findById', () => {
    it('should retrieve memory with graph context', async () => {
      const memory = createTestMemory({
        name: 'Findable Memory',
        memoryType: 'findable',
        metadata: { searchable: true }
      });

      // Add name embedding for persistence
      (memory as any).nameEmbedding = new Array(384).fill(0.3);

      await repository.create(memory);
      const result = await repository.findById(memory.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(memory.id);
      expect(result!.name).toBe(memory.name);
      expect(result!.metadata).toEqual(memory.metadata);
      expect(result!.related).toBeDefined();
    });

    it('should return null for non-existent memory', async () => {
      const result = await repository.findById('Bm>nonexistent12345');
      expect(result).toBeNull();
    });
  });

  describe('memory lifecycle operations', () => {
    it('should support full CRUD operations', async () => {
      // Create
      const memory = createTestMemory({
        name: 'CRUD Test Memory',
        memoryType: 'crud_test',
        metadata: { status: 'initial' }
      });

      // Add name embedding for persistence
      (memory as any).nameEmbedding = new Array(384).fill(0.4);

      const created = await repository.create(memory);
      expect(created.id).toBe(memory.id);

      // Read
      const retrieved = await repository.findById(memory.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe(memory.name);

      // Update
      const updatedMemory: Memory = {
        ...retrieved!,
        name: 'Updated CRUD Memory',
        metadata: { status: 'updated' },
        modifiedAt: new Date()
      };

      const updated = await repository.update(updatedMemory);
      expect(updated.name).toBe('Updated CRUD Memory');
      expect(updated.metadata.status).toBe('updated');

      // Delete
      const deleted = await repository.delete(memory.id);
      expect(deleted).toBe(true);

      // Verify deletion
      const afterDelete = await repository.findById(memory.id);
      expect(afterDelete).toBeNull();
    });

    it('should handle observations management', async () => {
      const memory = createTestMemory({
        name: 'Observation Test Memory',
        memoryType: 'obs_test'
      });

      // Add name embedding for persistence
      (memory as any).nameEmbedding = new Array(384).fill(0.5);

      await repository.create(memory);

      // Add observations
      await repository.addObservations(memory.id, [
        'First observation',
        'Second observation'
      ]);

      const withObs = await repository.findById(memory.id);
      expect(withObs!.observations).toHaveLength(2);

      // Delete specific observation by ID
      const obsToDelete = withObs!.observations![0].id!;
      await repository.deleteObservations(memory.id, [obsToDelete]);

      const afterDelete = await repository.findById(memory.id);
      expect(afterDelete!.observations).toHaveLength(1);
      expect(afterDelete!.observations![0].content).toBe('Second observation');
    });

    it('should handle relationship operations', async () => {
      // Create two memories for relationship testing
      const memory1 = createTestMemory({
        name: 'Source Memory',
        memoryType: 'relation_test'
      });
      const memory2 = createTestMemory({
        name: 'Target Memory',
        memoryType: 'relation_test'
      });

      // Add name embeddings
      (memory1 as any).nameEmbedding = new Array(384).fill(0.6);
      (memory2 as any).nameEmbedding = new Array(384).fill(0.7);

      await repository.create(memory1);
      await repository.create(memory2);

      // Create enhanced relationship
      await repository.createEnhancedRelation({
        fromId: memory1.id,
        toId: memory2.id,
        relationType: 'INFLUENCES',
        strength: 0.8,
        source: 'agent',
        createdAt: new Date().toISOString()
      });

      // Verify relationship exists in graph context
      const source = await repository.findById(memory1.id);
      expect(source!.related?.descendants).toBeDefined();
      expect(source!.related!.descendants!.length).toBeGreaterThan(0);

      const target = await repository.findById(memory2.id);
      expect(target!.related?.ancestors).toBeDefined();
      expect(target!.related!.ancestors!.length).toBeGreaterThan(0);

      // Delete relationship
      await repository.deleteRelation(memory1.id, memory2.id, 'INFLUENCES');

      // Verify relationship is removed
      const sourceAfter = await repository.findById(memory1.id);
      const targetAfter = await repository.findById(memory2.id);
      
      // Related should be undefined or empty arrays
      expect(sourceAfter!.related?.descendants || []).toHaveLength(0);
      expect(targetAfter!.related?.ancestors || []).toHaveLength(0);
    });
  });
});
