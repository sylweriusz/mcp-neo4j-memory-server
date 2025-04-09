import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Neo4jKnowledgeGraphManager } from '../src/manager';
import { NullLogger } from '../src/logger';

// Mock neo4j-driver module
vi.mock('neo4j-driver', () => {
  const mockSession = {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn(),
  };

  const mockDriver = {
    session: vi.fn().mockReturnValue(mockSession),
    close: vi.fn(),
  };

  return {
    default: {
      auth: {
        basic: vi.fn(),
      },
      driver: vi.fn().mockReturnValue(mockDriver),
    },
  };
});

describe('Neo4jKnowledgeGraphManager', () => {
  let manager: Neo4jKnowledgeGraphManager;
  let logger: NullLogger;

  beforeEach(() => {
    logger = new NullLogger();
    manager = new Neo4jKnowledgeGraphManager(
      () => ({
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'password',
        database: 'neo4j',
      }),
      logger
    );
  });

  afterEach(async () => {
    await manager.close();
  });

  it('should initialize correctly', () => {
    expect(manager).toBeInstanceOf(Neo4jKnowledgeGraphManager);
  });

  it('should create entities', async () => {
    const entities = [
      {
        name: 'TestEntity',
        entityType: 'Test',
        observations: ['Test observation'],
      },
    ];

    const result = await manager.createEntities(entities);
    expect(result).toEqual(entities);
  });

  it('should search nodes', async () => {
    const result = await manager.searchNodes('test');
    expect(result).toBeDefined();
  });
});
