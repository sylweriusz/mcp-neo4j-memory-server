import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Neo4jKnowledgeGraphManager } from '../src/manager';
import { NullLogger } from '../src/logger';

// Mock neo4j-driver module
vi.mock('neo4j-driver', () => {
  const mockTransaction = {
    run: vi.fn().mockImplementation((query, params) => {
      // Simulate empty entity check for createEntities
      if (query.includes('MATCH (e:Entity)') && query.includes('RETURN e.name')) {
        return { records: [] };
      }
      // Always return empty records by default
      return { records: [] };
    }),
    commit: vi.fn().mockResolvedValue({}),
    rollback: vi.fn().mockResolvedValue({}),
  };

  const mockSession = {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue({}),
    beginTransaction: vi.fn().mockReturnValue(mockTransaction),
  };

  const mockDriver = {
    session: vi.fn().mockReturnValue(mockSession),
    close: vi.fn().mockResolvedValue({}),
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
    vi.clearAllMocks();
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

    // Mock the transaction run method to simulate proper behavior
    const mockTx = {
      run: vi.fn().mockImplementation((query, params) => {
        if (query.includes('MATCH (e:Entity)') && query.includes('RETURN e.name')) {
          return { records: [] }; // No existing entities
        }
        return { records: [] };
      }),
      commit: vi.fn().mockResolvedValue({}),
      rollback: vi.fn().mockResolvedValue({}),
    };
    
    const mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue({}),
      beginTransaction: vi.fn().mockReturnValue(mockTx),
    };
    
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSession);

    const result = await manager.createEntities(entities);
    
    // Since empty entity results, should return the entities as created
    expect(result).toEqual(entities);
  });

  it('should create relations', async () => {
    const relations = [
      {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
      },
    ];

    // Mock the transaction run method to simulate proper behavior
    const mockTx = {
      run: vi.fn().mockImplementation((query, params) => {
        if (query.includes('MATCH (e:Entity)') && query.includes('RETURN e.name')) {
          return { 
            records: [
              { get: () => 'EntityA' },
              { get: () => 'EntityB' }
            ] 
          }; // Existing entities
        }
        if (query.includes('MATCH (from:Entity {name: $fromName})-[r:RELATES_TO {relationType: $relationType}]->(to:Entity {name: $toName})')) {
          return { 
            records: [
              { get: (key: string) => key === 'count' ? { toNumber: () => 0 } : null }
            ]
          }; // No existing relation
        }
        return { records: [] };
      }),
      commit: vi.fn().mockResolvedValue({}),
      rollback: vi.fn().mockResolvedValue({}),
    };
    
    const mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue({}),
      beginTransaction: vi.fn().mockReturnValue(mockTx),
    };
    
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSession);

    const result = await manager.createRelations(relations);
    expect(result).toEqual(relations);
  });

  it('should add observations', async () => {
    const observations = [
      {
        entityName: 'TestEntity',
        contents: ['New observation'],
      },
    ];

    // Mock the transaction run method to simulate proper behavior
    const mockTx = {
      run: vi.fn().mockImplementation((query, params) => {
        if (query.includes('MATCH (e:Entity {name: $entityName})') && !query.includes('HAS_OBSERVATION')) {
          return { records: [{}] }; // Entity exists
        }
        if (query.includes('MATCH (e:Entity {name: $entityName})-[:HAS_OBSERVATION]->(o:Observation)')) {
          return { records: [] }; // No existing observations
        }
        return { records: [] };
      }),
      commit: vi.fn().mockResolvedValue({}),
      rollback: vi.fn().mockResolvedValue({}),
    };
    
    const mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue({}),
      beginTransaction: vi.fn().mockReturnValue(mockTx),
    };
    
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSession);

    const result = await manager.addObservations(observations);
    expect(result).toEqual(observations);
  });

  it('should delete entities', async () => {
    const entityNames = ['TestEntity'];
    
    await expect(manager.deleteEntities(entityNames)).resolves.not.toThrow();
  });

  it('should delete observations', async () => {
    const deletions = [
      {
        entityName: 'TestEntity',
        contents: ['Observation to delete'],
      },
    ];
    
    await expect(manager.deleteObservations(deletions)).resolves.not.toThrow();
  });

  it('should delete relations', async () => {
    const relations = [
      {
        from: 'EntityA',
        to: 'EntityB',
        relationType: 'RELATES_TO',
      },
    ];
    
    await expect(manager.deleteRelations(relations)).resolves.not.toThrow();
  });

  it('should search nodes', async () => {
    const result = await manager.searchNodes('test');
    expect(result).toEqual({ entities: [], relations: [] });
  });

  it('should open nodes', async () => {
    const result = await manager.openNodes(['TestEntity']);
    expect(result).toEqual({ entities: [], relations: [] });
  });
});
