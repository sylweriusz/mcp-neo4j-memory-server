/**
 * Neo4j Memory Repository Integration Tests
 * Tests against real Neo4j database to verify GDD compliance
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Neo4jMemoryRepository } from '../../src/infrastructure/repositories/neo4j-memory-repository';
import { Memory } from '../../src/domain/entities/memory';
import { SessionFactory } from '../../src/infrastructure/database/session-factory';
import { Neo4jDriverManager } from '../../src/infrastructure/database/neo4j-driver';
import { generateCompactId } from '../../src/id_generator';

describe('Neo4j Memory Repository Integration', () => {
  let repository: Neo4jMemoryRepository;
  let sessionFactory: SessionFactory;
  let driverManager: Neo4jDriverManager;
  let testMemoryIds: string[] = [];

  beforeEach(async () => {
    // Use test database
    driverManager = new Neo4jDriverManager();
    driverManager.switchDatabase('neo4j'); // Fallback to default for tests
    
    sessionFactory = new SessionFactory(driverManager);
    repository = new Neo4jMemoryRepository(sessionFactory);
    
    testMemoryIds = [];
  });

  afterEach(async () => {
    // Cleanup test data
    for (const id of testMemoryIds) {
      try {
        await repository.delete(id);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    await driverManager.close();
  });

  describe('create', () => {
    it('should create memory with proper GDD structure', async () => {
      const memory = new Memory(
        generateCompactId(),
        'Test Memory',
        'project',
        { status: 'active' },
        new Date(),
        new Date(),
        new Date(),
        ['test', 'memory']
      );
      
      testMemoryIds.push(memory.id);
      
      const created = await repository.create(memory);
      
      expect(created.id).toBe(memory.id);
      expect(created.name).toBe(memory.name);
      expect(created.memoryType).toBe(memory.memoryType);
      expect(created.tags).toEqual(memory.tags);
    });

    it('should create observations with memory', async () => {
      const memory = new Memory(
        generateCompactId(),
        'Memory with Observations',
        'project'
      );
      
      // Add observations to memory
      (memory as any).observations = [
        { content: 'First observation', createdAt: new Date().toISOString() },
        { content: 'Second observation', createdAt: new Date().toISOString() }
      ];
      
      testMemoryIds.push(memory.id);
      
      const created = await repository.create(memory);
      const retrieved = await repository.findById(memory.id);
      
      expect(retrieved).toBeTruthy();
      expect(retrieved!.observations).toHaveLength(2);
      expect(retrieved!.observations[0].content).toBe('First observation');
    });
  });

  describe('findById', () => {
    it('should retrieve memory with graph context', async () => {
      const memory = new Memory(
        generateCompactId(),
        'Findable Memory',
        'project',
        { test: true }
      );
      
      testMemoryIds.push(memory.id);
      await repository.create(memory);
      
      const found = await repository.findById(memory.id);
      
      expect(found).toBeTruthy();
      expect(found!.id).toBe(memory.id);
      expect(found!.name).toBe(memory.name);
      expect(found!.related).toBeDefined();
    });

    it('should return null for non-existent memory', async () => {
      const found = await repository.findById('nonexistent12345');
      expect(found).toBeNull();
    });
  });
});
