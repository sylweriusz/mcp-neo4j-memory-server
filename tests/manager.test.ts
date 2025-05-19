import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Neo4jKnowledgeGraphManager } from '../src/manager';
import { NullLogger } from '../src/logger';

// Mock neo4j-driver module
vi.mock('neo4j-driver', () => {
  const mockTransaction = {
    run: vi.fn().mockImplementation((query, params) => {
      // Simulate empty memory check for createMemories
      if (query.includes('MATCH (m:Memory)') && query.includes('RETURN m.id')) {
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

// Mock id_generator module
vi.mock('../src/id_generator', () => ({
  generateCompactId: vi.fn().mockReturnValue('6g0A8!7HX5%)~$qB')
}));

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

  it('should create memories', async () => {
    const memories = [
      {
        id: '6g0A8!7HX5%)~$qB',
        name: 'TestMemory',
        memoryType: 'Test',
        observations: ['Test observation'],
      },
    ];

    // Mock the transaction run method to simulate proper behavior
    const mockTx = {
      run: vi.fn().mockImplementation((query, params) => {
        if (query.includes('MATCH (m:Memory)') && query.includes('RETURN m.id')) {
          return { records: [] }; // No existing memories
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

    const result = await manager.createMemories(memories);
    
    // Verify timestamp fields were added
    expect(result[0].id).toBe('6g0A8!7HX5%)~$qB');
    expect(result[0].createdAt).toBeDefined();
    expect(result[0].modifiedAt).toBeDefined();
  });

  it('should create relations', async () => {
    const relations = [
      {
        fromId: '6g0A8!7HX5%)~$qB',
        toId: '7B^d2@9KX5%)<>qC',
        relationType: 'RELATES_TO',
      },
    ];

    // Mock the session run method to simulate both memory IDs exist
    const mockSession = {
      run: vi.fn().mockImplementation((query, params) => {
        // Check for memory existence query
        if (query.includes('MATCH (m:Memory)') && query.includes('RETURN collect(m.id) AS existingIds')) {
          return { 
            records: [
              { get: (key: string) => key === 'existingIds' ? ['6g0A8!7HX5%)~$qB', '7B^d2@9KX5%)<>qC'] : null }
            ] 
          }; // Both memory IDs exist
        }
        return { records: [] };
      }),
      close: vi.fn().mockResolvedValue({}),
      beginTransaction: vi.fn().mockReturnValue({
        run: vi.fn().mockImplementation((query, params) => {
          if (query.includes('MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})')) {
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
      }),
    };
    
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSession);

    const result = await manager.createRelations(relations);
    expect(result).toEqual(relations);
  });

  it('should add observations with timestamps', async () => {
    const observations = [
      {
        memoryId: '6g0A8!7HX5%)~$qB',
        contents: ['New observation'],
      },
    ];

    // Mock the transaction run method to simulate proper behavior
    const mockTx = {
      run: vi.fn().mockImplementation((query, params) => {
        if (query.includes('MATCH (m:Memory {id: $memoryId})') && !query.includes('HAS_OBSERVATION')) {
          return { records: [{ get: (key: string) => key === 'name' ? 'TestMemory' : null }] }; // Memory exists
        }
        if (query.includes('SET m.modifiedAt = $timestamp')) {
          return { records: [] }; // Timestamp update
        }
        if (query.includes('MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)')) {
          return { records: [] }; // No existing observations
        }
        return { records: [] };
      }),
      commit: vi.fn().mockResolvedValue({}),
      rollback: vi.fn().mockResolvedValue({}),
    };
    
    const mockSessionLocal = {
      run: vi.fn().mockImplementation(() => {
        return Promise.resolve({ 
          records: [{ get: (key: string) => key === 'existingIds' ? ['6g0A8!7HX5%)~$qB'] : [] }]  // Memory exists in initial check
        });
      }),
      close: vi.fn().mockResolvedValue({}),
      beginTransaction: vi.fn().mockReturnValue(mockTx),
    };
    
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSessionLocal);

    const result = await manager.addObservations(observations);
    
    // Verify the observation structure is maintained
    expect(result).toEqual(observations);
    
    // Verify timestamp update was called
    expect(mockTx.run).toHaveBeenCalledWith(
      expect.stringContaining('SET m.modifiedAt = $timestamp'),
      expect.objectContaining({
        memoryId: '6g0A8!7HX5%)~$qB',
        timestamp: expect.any(String)
      })
    );
    
    // Verify observation creation with timestamps
    expect(mockTx.run).toHaveBeenCalledWith(
      expect.stringContaining('CREATE (o:Observation {'),
      expect.objectContaining({
        memoryId: '6g0A8!7HX5%)~$qB',
        content: 'New observation',
        createdAt: expect.any(String),
        source: null,
        confidence: 1.0
      })
    );
  });

  it('should delete memories', async () => {
    const memoryIds = ['6g0A8!7HX5%)~$qB'];
    
    await expect(manager.deleteMemories(memoryIds)).resolves.not.toThrow();
  });

  it('should delete observations', async () => {
    const deletions = [
      {
        memoryId: '6g0A8!7HX5%)~$qB',
        contents: ['Observation to delete'],
      },
    ];
    
    await expect(manager.deleteObservations(deletions)).resolves.not.toThrow();
  });

  it('should delete relations', async () => {
    const relations = [
      {
        fromId: '6g0A8!7HX5%)~$qB',
        toId: '7B^d2@9KX5%)<>qC',
        relationType: 'RELATES_TO',
      },
    ];
    
    await expect(manager.deleteRelations(relations)).resolves.not.toThrow();
  });

  it('should search memories', async () => {
    const result = await manager.searchMemories('test');
    expect(result).toHaveProperty('memories', []);
    expect(result).toHaveProperty('relations', []);
    // Meta property is expected, but we don't need to test its exact value
    expect(result).toHaveProperty('_meta');
  });

  it('should retrieve memories and update lastAccessed', async () => {
    const mockSession = {
      run: vi.fn().mockImplementation((query) => {
        // Check if it's the timestamp update query
        if (query.includes('SET m.lastAccessed')) {
          return { records: [] };
        }
        // Return mock memory data with timestamps
        if (query.includes('RETURN m.id AS id, m.name AS name')) {
          return { 
            records: [{
              get: (key: string) => {
                switch(key) {
                  case 'id': return '6g0A8!7HX5%)~$qB';
                  case 'name': return 'TestMemory';
                  case 'memoryType': return 'Test';
                  case 'createdAt': return '2023-01-01T00:00:00.000Z';
                  case 'modifiedAt': return '2023-01-01T00:00:00.000Z';
                  case 'lastAccessed': return '2023-01-01T00:00:00.000Z';
                  case 'observationObjects': return [];
                  case 'tags': return [];
                  default: return null;
                }
              }
            }]
          };
        }
        // For relation queries
        return { records: [] };
      }),
      close: vi.fn().mockResolvedValue({}),
    };
    
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSession);

    const result = await manager.retrieveMemories(['6g0A8!7HX5%)~$qB']);
    
    // Verify timestamp fields were returned
    expect(result.memories[0].id).toBe('6g0A8!7HX5%)~$qB');
    expect(result.memories[0].createdAt).toBeDefined();
    expect(result.memories[0].modifiedAt).toBeDefined();
    expect(result.memories[0].lastAccessed).toBeDefined();
    
    // Verify timestamp update query was executed
    expect(mockSession.run).toHaveBeenCalledWith(
      expect.stringContaining('SET m.lastAccessed = $timestamp'),
      expect.anything()
    );
  });
  
  it('should generate compact ID for memories without ID', async () => {
    const memories = [
      {
        name: 'MemoryWithoutID',
        memoryType: 'Test',
        observations: ['Test observation']
      },
    ];

    // Mock the transaction run method to simulate proper behavior
    const mockTx = {
      run: vi.fn().mockImplementation((query, params) => {
        if (query.includes('MATCH (m:Memory)') && query.includes('RETURN m.id')) {
          return { records: [] }; // No existing memories
        }
        if (query.includes('MATCH (m:Memory)') && 
            query.includes('WHERE m.name = $name AND m.memoryType = $memoryType')) {
          return { records: [] }; // No memory with same name+type
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

    const result = await manager.createMemories(memories);
    
    // Should add compact ID to memory
    expect(result[0].id).toBe('6g0A8!7HX5%)~$qB');
  });

  it('should return existing memory ID when memory with same name and type already exists', async () => {
    const existingMemoryId = '6g0A8!7HX5%)~$qB'; // Use the mocked compact ID
    const memories = [
      {
        name: 'DuplicateMemory',
        memoryType: 'Test',
        observations: ['New observation']
      },
    ];

    // Mock the transaction run method to simulate an existing memory with same name+type
    const mockTx = {
      run: vi.fn().mockImplementation((query, params) => {
        console.log('MOCK QUERY:', query);
        
        // For the name+type uniqueness check - EXACT QUERY STRING MATCHING
        if (query.trim().includes('MATCH (m:Memory)') && 
            query.trim().includes('WHERE m.name = $name AND m.memoryType = $memoryType')) {
          console.log('MATCH FOUND FOR NAME+TYPE CHECK');
          
          // Create a proper mock Record object
          const mockRecord = {
            get: function(fieldName) {
              console.log('GET CALLED WITH:', fieldName);
              if (fieldName === 'id') {
                console.log('RETURNING ID:', existingMemoryId);
                return existingMemoryId;
              }
              if (fieldName === 'name') return 'DuplicateMemory';
              if (fieldName === 'memoryType') return 'Test';
              return null;
            }
          };
          
          return { records: [mockRecord] };
        }
        
        // For the initial memories ID query
        if (query.includes('MATCH (m:Memory)') && query.includes('RETURN m.id AS id')) {
          return { records: [] }; // No existing memories with this ID
        }

        // For the observation query
        if (query.includes('MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)')) {
          return { records: [] }; // No existing observations
        }

        // Default empty response
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
    
    // Replace getAllMemories to avoid issues
    vi.spyOn(manager as any, 'getAllMemories').mockResolvedValue([]);
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSession);

    const result = await manager.createMemories(memories);
    
    console.log('RESULT:', result);
    
    // Should return memory with existing ID instead of creating new
    expect(result[0].id).toBe(existingMemoryId);
  });

  it('should add new observations to existing memory with same name and type', async () => {
    const existingMemoryId = '6g0A8!7HX5%)~$qB'; // Use the mocked compact ID
    const existingObservation = 'Existing observation';
    const newObservation = 'New observation';
    
    const memories = [
      {
        name: 'DuplicateMemory',
        memoryType: 'Test',
        observations: [existingObservation, newObservation]
      },
    ];

    // Mock the pre-calculation step
    vi.spyOn(manager as any, 'precalculateEmbeddings').mockResolvedValue(new Map([
      ['DuplicateMemoryTest', {
        nameEmbedding: new Array(384).fill(0.5),
        tags: ['test', 'duplicate'],
        observationEmbeddings: [new Array(384).fill(0.3), new Array(384).fill(0.4)]
      }]
    ]));
    
    // Setup transaction mock with sequence of responses
    const mockTx = {
      run: vi.fn(),
      commit: vi.fn().mockResolvedValue({}),
      rollback: vi.fn().mockResolvedValue({}),
    };
    
    // First query: memory IDs check (returns no existing memories by ID)
    // Second query: check for existing memory by name+type
    vi.spyOn(mockTx, 'run')
    .mockImplementationOnce(() => {
      // Return an existing memory with the same name and type
      const mockRecord = {
        get: (fieldName: string) => {
          console.log('GET CALLED WITH:', fieldName);
          switch (fieldName) {
            case 'id': 
              console.log('RETURNING ID:', existingMemoryId);
              return existingMemoryId;
            case 'name': return 'DuplicateMemory';
            case 'memoryType': return 'Test';
            default: return null;
          }
        }
      };
      console.log('MATCH FOUND FOR NAME+TYPE CHECK');
      return { records: [mockRecord] };
    })
    // Third query: check for existing observations
    .mockImplementationOnce(() => {
      // Return one existing observation
      const mockRecord = {
        get: (fieldName: string) => {
          if (fieldName === 'content') return existingObservation;
          return null;
        }
      };
      return { records: [mockRecord] };
    })
    // Fourth query: adding the new observation
    .mockImplementationOnce(() => {
      return { records: [] };
    })
    // Fifth query: update timestamp
    .mockImplementationOnce(() => {
      return { records: [] };
    });
    
    const mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue({}),
      beginTransaction: vi.fn().mockReturnValue(mockTx),
    };
    
    vi.spyOn(manager as any, 'getSession').mockReturnValue(mockSession);

    const result = await manager.createMemories(memories);
    
    // This memory should have the existing ID
    expect(result[0]?.id).toBe(existingMemoryId);
    
    // Should only add the new observation, not the duplicate one
    const observationAddCalls = mockTx.run.mock.calls.filter(
      call => typeof call[0] === 'string' && 
             call[0].includes('CREATE (o:Observation') && 
             call[1] && call[1].content === newObservation
    );
    
    // Verify only one observation was added
    expect(observationAddCalls.length).toBe(1);
  });
});
