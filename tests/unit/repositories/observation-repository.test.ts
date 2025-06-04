/**
 * ObservationRepository Production Tests
 * THE IMPLEMENTOR'S RULE: Test exactly what the production code does
 * No mocks for critical infrastructure - use test databases
 */

import { Session } from 'neo4j-driver';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Neo4jDriverManager } from '../../../src/infrastructure/database/neo4j-driver';
import { SessionFactory } from '../../../src/infrastructure/database/session-factory';
import { ObservationRepository, ObservationData } from '../../../src/infrastructure/repositories/memory/observation-repository';
import { generateCompactId } from '../../../src/id_generator';

describe('ObservationRepository - Production Coverage', () => {
  let driverManager: Neo4jDriverManager;
  let sessionFactory: SessionFactory;
  let session: Session;
  let repository: ObservationRepository;
  let testMemoryId: string;

  beforeEach(async () => {
    // Initialize real components - aligned with current architecture
    driverManager = new Neo4jDriverManager();
    sessionFactory = new SessionFactory(driverManager);
    session = sessionFactory.createSession();
    repository = new ObservationRepository();

    // Create test memory for observations
    testMemoryId = generateCompactId();
    await session.run(`
      CREATE (m:Memory {
        id: $memoryId,
        name: 'Test Memory',
        memoryType: 'test',
        metadata: '{}',
        createdAt: $timestamp,
        modifiedAt: $timestamp,
        lastAccessed: $timestamp
      })`,
      { 
        memoryId: testMemoryId, 
        timestamp: new Date().toISOString() 
      }
    );
  });

  afterEach(async () => {
    // Clean up test data
    if (session) {
      try {
        await session.run(
          'MATCH (m:Memory {id: $id})-[:HAS_OBSERVATION]->(o:Observation) DETACH DELETE o, m',
          { id: testMemoryId }
        );
      } catch (error) {
        // Silent cleanup - test might have already deleted the data
      }
      await session.close();
    }
    
    // Close driver
    if (driverManager) {
      await driverManager.close();
    }
  });

  describe('createObservations', () => {
    test('should create multiple observations successfully', async () => {
      const contents = ['First observation', 'Second observation', 'Third observation'];
      
      await repository.createObservations(session, testMemoryId, contents);

      // Verify observations were created
      const result = await session.run(`
        MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
        RETURN o.content as content, o.id as id
        ORDER BY o.createdAt ASC`,
        { memoryId: testMemoryId }
      );

      expect(result.records).toHaveLength(3);
      expect(result.records[0].get('content')).toBe('First observation');
      expect(result.records[1].get('content')).toBe('Second observation');
      expect(result.records[2].get('content')).toBe('Third observation');
    });

    test('should reject empty content', async () => {
      const contents = ['Valid content', '', 'Another valid content'];
      
      await expect(
        repository.createObservations(session, testMemoryId, contents)
      ).rejects.toThrow('Observation content must be a non-empty string');
    });

    test('should reject non-string content', async () => {
      const contents = ['Valid content', null as any, 'Another valid content'];
      
      await expect(
        repository.createObservations(session, testMemoryId, contents)
      ).rejects.toThrow('Observation content must be a non-empty string');
    });

    test('should handle whitespace-only content', async () => {
      const contents = ['Valid content', '   ', 'Another valid content'];
      
      await expect(
        repository.createObservations(session, testMemoryId, contents)
      ).rejects.toThrow('Observation content must be a non-empty string');
    });
  });

  describe('deleteObservations', () => {
    test('should delete specific observations by ID', async () => {
      // First create some observations
      const contents = ['First observation', 'Second observation', 'Third observation'];
      await repository.createObservations(session, testMemoryId, contents);
      
      // Get observation IDs
      const beforeResult = await session.run(`
        MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
        RETURN o.id as id
        ORDER BY o.createdAt ASC`,
        { memoryId: testMemoryId }
      );
      
      const observationIds = beforeResult.records.map(record => record.get('id'));
      expect(observationIds).toHaveLength(3);
      
      // Delete the middle observation
      await repository.deleteObservations(session, testMemoryId, [observationIds[1]]);
      
      // Verify only 2 observations remain
      const afterResult = await session.run(`
        MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
        RETURN o.content as content
        ORDER BY o.createdAt ASC`,
        { memoryId: testMemoryId }
      );
      
      expect(afterResult.records).toHaveLength(2);
      expect(afterResult.records[0].get('content')).toBe('First observation');
      expect(afterResult.records[1].get('content')).toBe('Third observation');
    });

    test('should handle deletion of non-existent observations gracefully', async () => {
      const fakeObservationId = generateCompactId();
      
      // Should not throw error when deleting non-existent observations
      await expect(
        repository.deleteObservations(session, testMemoryId, [fakeObservationId])
      ).resolves.not.toThrow();
    });
  });

  describe('getObservationsForMemory', () => {
    test('should return observations in chronological order', async () => {
      const contents = ['First observation', 'Second observation', 'Third observation'];
      
      // Create observations with small delays to ensure different timestamps
      for (const content of contents) {
        await repository.createObservations(session, testMemoryId, [content]);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const observations = await repository.getObservationsForMemory(session, testMemoryId);
      
      expect(observations).toHaveLength(3);
      expect(observations[0].content).toBe('First observation');
      expect(observations[1].content).toBe('Second observation');
      expect(observations[2].content).toBe('Third observation');
    });

    test('should return empty array for memory with no observations', async () => {
      const observations = await repository.getObservationsForMemory(session, testMemoryId);
      expect(observations).toHaveLength(0);
    });

    test('should include observation IDs for deletion operations', async () => {
      const contents = ['Test observation with ID'];
      await repository.createObservations(session, testMemoryId, contents);

      const observations = await repository.getObservationsForMemory(session, testMemoryId);
      
      expect(observations).toHaveLength(1);
      expect(observations[0].id).toBeDefined();
      expect(observations[0].id).toHaveLength(18); // BASE85 compact ID length
      expect(observations[0].content).toBe('Test observation with ID');
    });
  });

  describe('getBatchObservations', () => {
    test('should return observations for multiple memories', async () => {
      // Create another test memory
      const secondMemoryId = generateCompactId();
      await session.run(`
        CREATE (m:Memory {
          id: $memoryId,
          name: 'Second Test Memory',
          memoryType: 'test',
          metadata: '{}',
          createdAt: $timestamp,
          modifiedAt: $timestamp,
          lastAccessed: $timestamp
        })`,
        { 
          memoryId: secondMemoryId, 
          timestamp: new Date().toISOString() 
        }
      );

      // Add observations to both memories
      await repository.createObservations(session, testMemoryId, ['First memory obs']);
      await repository.createObservations(session, secondMemoryId, ['Second memory obs']);

      const observationsMap = await repository.getBatchObservations(session, [testMemoryId, secondMemoryId]);
      
      expect(observationsMap.size).toBe(2);
      expect(observationsMap.get(testMemoryId)).toHaveLength(1);
      expect(observationsMap.get(secondMemoryId)).toHaveLength(1);
      expect(observationsMap.get(testMemoryId)![0].content).toBe('First memory obs');
      expect(observationsMap.get(secondMemoryId)![0].content).toBe('Second memory obs');

      // Clean up second memory
      await session.run(
        'MATCH (m:Memory {id: $id})-[:HAS_OBSERVATION]->(o:Observation) DETACH DELETE o, m',
        { id: secondMemoryId }
      );
    });

    test('should handle empty memory IDs array', async () => {
      const observationsMap = await repository.getBatchObservations(session, []);
      expect(observationsMap.size).toBe(0);
    });

    test('should filter out observations without content', async () => {
      // Create valid observation
      await repository.createObservations(session, testMemoryId, ['Valid observation']);
      
      // Create invalid observation directly (bypassing repository validation)
      await session.run(`
        MATCH (m:Memory {id: $memoryId})
        CREATE (o:Observation {
          id: $obsId,
          content: '',
          createdAt: $timestamp
        })
        CREATE (m)-[:HAS_OBSERVATION]->(o)`,
        { 
          memoryId: testMemoryId,
          obsId: generateCompactId(),
          timestamp: new Date().toISOString() 
        }
      );

      const observationsMap = await repository.getBatchObservations(session, [testMemoryId]);
      
      expect(observationsMap.size).toBe(1);
      const observations = observationsMap.get(testMemoryId);
      expect(observations).toHaveLength(1); // Only the valid observation
      expect(observations![0].content).toBe('Valid observation');
    });
  });
});
