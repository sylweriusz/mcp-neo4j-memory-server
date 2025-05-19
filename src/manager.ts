import {
  KnowledgeGraphManagerInterface,
  Memory,
  MemoryInput,
  MemoryResponse,
  Relation,
  Observation,
  KnowledgeGraph,
  MemoryGraph,
  EnhancedSearchResult,
  EnhancedSearchResponse,
} from "./types";
import { Logger, ConsoleLogger } from "./logger";
import neo4j, { Driver, Session, Record, QueryResult } from "neo4j-driver";
import { extractError, convertDateTimeToString } from "./utils";
import dotenv from "dotenv";
import { generateCompactId } from './id_generator';
import { 
  calculateEmbedding, 
  extractTags,
  processMemoryVectors
} from "./vector";
import { ensureVectorIndexes } from "./vector/support";
import { EnhancedUnifiedSearch } from "./search/enhanced-unified-search";

// Load environment variables
dotenv.config();

/**
 * An implementation of the KnowledgeGraphManagerInterface that uses Neo4j and EnhancedUnifiedSearch
 */
export class Neo4jKnowledgeGraphManager
  implements KnowledgeGraphManagerInterface
{
  private driver: Driver | null = null;
  private initialized: boolean = false;
  private database: string | null = null;
  private logger: Logger;
  private neo4jConfig: { 
    uri: string; 
    username: string; 
    password: string; 
    database: string; 
  } | null = null;
  private searchEngine?: EnhancedUnifiedSearch;

  /**
   * Constructor
   * @param neo4jConfigProvider Function to get Neo4j connection settings
   * @param logger Optional logger instance
   */
  constructor(
    private neo4jConfigProvider: () => {
      uri: string;
      username: string;
      password: string;
      database: string;
    },
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger();
    // Lazy initialization - don't connect to database in constructor
  }

  /**
   * Ensure driver is initialized
   * @private
   */
  private ensureDriver(): void {
    if (!this.driver) {
      this.neo4jConfig = this.neo4jConfigProvider();
      this.database = this.neo4jConfig.database;
      this.driver = neo4j.driver(
        this.neo4jConfig.uri,
        neo4j.auth.basic(this.neo4jConfig.username, this.neo4jConfig.password)
      );
    }
  }

  /**
   * Get a new session
   * @public - needed for database manager access
   */
  getSession(): Session {
    this.ensureDriver();
    return this.driver!.session({ database: this.database! });
  }
  
  /**
   * Get a system session - useful for database management operations
   * This method is intended for internal use by DatabaseManager
   * @protected
   */
  protected getSystemSession(): Session {
    this.ensureDriver();
    return this.driver!.session({ database: "system" });
  }

  /**
   * Initialize the database
   * @private
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const session = this.getSession();

      try {
        // Create constraints and indexes for better performance
        await session.run(`
          CREATE CONSTRAINT FOR (m:Memory) REQUIRE m.id IS UNIQUE
        `);
        
        // Create index for name+memoryType uniqueness check
        await session.run(`
          CREATE INDEX IF NOT EXISTS FOR (m:Memory) ON (m.name, m.memoryType)
        `);
        
        // Create vector indexes (includes metadata fulltext index)
        await ensureVectorIndexes(session);
        
        this.initialized = true;
        this.logger.info("Neo4j database initialized successfully");
      } catch (error) {
        this.logger.error("Failed to initialize database", extractError(error));
      } finally {
        await session.close();
      }
    } catch (error) {
      this.logger.error("Failed to connect to Neo4j", extractError(error));
    }
  }

  /**
   * Get all memories from the database
   * @private
   */
  private async getAllMemories(): Promise<Memory[]> {
    const session = this.getSession();
    try {
      // Retrieve memories and their observations
      const result = await session.run(`
        MATCH (m:Memory)
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
        RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType, 
               m.metadata AS metadata,
               m.createdAt AS createdAt, m.modifiedAt AS modifiedAt, m.lastAccessed AS lastAccessed,
               collect(DISTINCT o.content) AS observations,
               collect(DISTINCT t.name) AS tags
      `);

      // Convert Neo4j records to Memory objects
      const memories: Memory[] = result.records.map((record: Record) => {
        const id = record.get("id");
        const name = record.get("name");
        const memoryType = record.get("memoryType");
        const metadata = record.get("metadata") ? JSON.parse(record.get("metadata")) : undefined;
        const createdAt = record.get("createdAt");
        const modifiedAt = convertDateTimeToString(record.get("modifiedAt"));
        const lastAccessed = record.get("lastAccessed");
        // nameEmbedding is omitted - only used internally for vector search
        const observations = record.get("observations").filter(Boolean); // Remove null values
        const tags = record.get("tags").filter(Boolean); // Remove null values

        return {
          id,
          name,
          memoryType,
          metadata,
          createdAt,
          modifiedAt,
          lastAccessed,
          // nameEmbedding omitted from response
          tags,
          observations,
        };
      });

      return memories;
    } catch (error) {
      this.logger.error("Error getting all memories", extractError(error));
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Pre-calculate all embeddings for a batch of memories
   * This ensures no embedding calculations happen within transactions
   * Fails fast if any embedding calculation fails
   */
  private async precalculateEmbeddings(memories: MemoryInput[]): Promise<Map<string, {nameEmbedding: number[], tags: string[], observationEmbeddings: number[][]}>> {
    const precomputedData = new Map();
    
    for (const memory of memories) {
      // Validate name before processing
      if (!memory.name || memory.name.trim() === '') {
        throw new Error(`Memory name cannot be empty or null for memory type: ${memory.memoryType}`);
      }
      
      try {
        // Calculate name embedding
        const nameEmbedding = await calculateEmbedding(memory.name);
        
        // Extract tags from name - pass a session to avoid Map{} issues
        const session = this.getSession();
        let tags: string[] = [];
        try {
          tags = await extractTags(memory.name, session);
        } catch (error) {
          // Error during tag extraction - continuing without tags
          tags = [];
        } finally {
          await session.close();
        }
        
        // Calculate embeddings for all observations
        const observationEmbeddings: number[][] = [];
        for (const observation of memory.observations) {
          if (!observation || observation.trim() === '') {
            throw new Error(`Observation content cannot be empty or null for memory: ${memory.name}`);
          }
          const embedding = await calculateEmbedding(observation);
          observationEmbeddings.push(embedding);
        }
        
        precomputedData.set(memory.name + memory.memoryType, {
          nameEmbedding,
          tags,
          observationEmbeddings
        });
      } catch (error) {
        // Fail fast - don't continue with partial data
        throw new Error(`Failed to precalculate embeddings for memory "${memory.name}": ${error.message}`);
      }
    }
    
    return precomputedData;
  }

  /**
   * Create memories with name+memoryType uniqueness constraint
   * All embeddings calculated BEFORE transaction begins
   * @param memories Array of memory inputs to create (without IDs)
   * @returns Array of created memories (with generated IDs)
   */
  async createMemories(memories: MemoryInput[]): Promise<MemoryResponse[]> {
    if (!this.initialized) await this.initialize();
    if (memories.length === 0) return [];

    // Pre-calculate ALL embeddings BEFORE any database operations
    const precomputedData = await this.precalculateEmbeddings(memories);

    const session = this.getSession();
    const createdMemories: MemoryResponse[] = [];

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        const now = new Date().toISOString();
        const processedMemories: Memory[] = [];

        // Process each memory individually to check for name+memoryType uniqueness
        for (const memoryInput of memories) {
          // Check for existing memory with same name + memoryType
          const existingMemoryResult = await tx.run(
            `
            MATCH (m:Memory)
            WHERE m.name = $name AND m.memoryType = $memoryType
            RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType
            LIMIT 1
            `,
            { 
              name: memoryInput.name, 
              memoryType: memoryInput.memoryType 
            }
          );

          // If memory with same name+type exists, use that ID and add observations
          if (existingMemoryResult.records.length > 0) {
            const existingMemoryId = existingMemoryResult.records[0].get("id");
            
            // Get precomputed data for this memory
            const computedData = precomputedData.get(memoryInput.name + memoryInput.memoryType);
            
            // Add any new observations to the existing memory
            if (memoryInput.observations && memoryInput.observations.length > 0) {
              // Get existing observations for this memory
              const existingObsResult = await tx.run(
                `
                MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
                RETURN o.content AS content
                `,
                { memoryId: existingMemoryId }
              );
              const existingObservations = new Set(
                existingObsResult.records.map((record) => record.get("content"))
              );

              // Only add observations that don't already exist
              let obsIndex = 0;
              for (const observation of memoryInput.observations) {
                if (!existingObservations.has(observation)) {
                  // Use precomputed embedding - NO calculation inside transaction
                  const embedding = computedData?.observationEmbeddings[obsIndex] || null;
                  
                  await tx.run(
                    `
                    MATCH (m:Memory {id: $memoryId})
                    CREATE (o:Observation {
                      content: $content,
                      createdAt: $createdAt,
                      source: $source,
                      confidence: $confidence,
                      embedding: $embedding
                    })
                    CREATE (m)-[:HAS_OBSERVATION]->(o)
                    `,
                    { 
                      memoryId: existingMemoryId, 
                      content: observation,
                      createdAt: now,
                      source: null,
                      confidence: 1.0,
                      embedding
                    }
                  );
                }
                obsIndex++;
              }
            }

            // Update modifiedAt timestamp
            await tx.run(
              `
              MATCH (m:Memory {id: $memoryId})
              SET m.modifiedAt = $timestamp
              `,
              { memoryId: existingMemoryId, timestamp: now }
            );

            // Add to created memories with the existing ID
            createdMemories.push({
              id: existingMemoryId,
              name: memoryInput.name,
              memoryType: memoryInput.memoryType,
              metadata: memoryInput.metadata,
              createdAt: memoryInput.createdAt,
              modifiedAt: now,
              lastAccessed: memoryInput.lastAccessed,
              tags: memoryInput.tags,
              observations: memoryInput.observations
            });
            
            continue; // Skip to next memory since we've handled this one
          }

          // This is a genuinely new memory - generate a new ID
          const processedMemory: Memory = {
            id: generateCompactId(),
            name: memoryInput.name,
            memoryType: memoryInput.memoryType,
            metadata: memoryInput.metadata,
            createdAt: memoryInput.createdAt || now,
            modifiedAt: memoryInput.modifiedAt || now,
            lastAccessed: memoryInput.lastAccessed || now,
            tags: memoryInput.tags || [],
            observations: memoryInput.observations
          };

          processedMemories.push(processedMemory);
        }

        // Process each new memory with pre-computed embeddings
        for (const memory of processedMemories) {
          // Get precomputed data - NO calculations here
          const computedData = precomputedData.get(memory.name + memory.memoryType);
          const nameEmbedding = computedData?.nameEmbedding || null;
          const tags = computedData?.tags || [];
          
          // Create memory node with embeddings and tags
          await tx.run(
            `
            CREATE (m:Memory {
              id: $id, 
              name: $name, 
              memoryType: $memoryType,
              metadata: $metadata,
              createdAt: $createdAt,
              modifiedAt: $modifiedAt,
              lastAccessed: $createdAt,
              nameEmbedding: $nameEmbedding,
              tags: $tags
            })
            RETURN m
            `,
            { 
              id: memory.id,
              name: memory.name, 
              memoryType: memory.memoryType,
              metadata: memory.metadata ? JSON.stringify(
                // Ensure we're working with a plain object, not a Map
                memory.metadata instanceof Map 
                  ? Object.fromEntries(memory.metadata.entries())
                  : memory.metadata
              ) : null,
              createdAt: memory.createdAt,
              modifiedAt: memory.modifiedAt,
              nameEmbedding,
              tags
            }
          );

          // Create observation nodes and relationships
          let obsIndex = 0;
          for (const observation of memory.observations) {
            // Use precomputed embedding - NO calculation inside transaction
            const embedding = computedData?.observationEmbeddings[obsIndex] || null;
            
            await tx.run(
              `
              MATCH (m:Memory {id: $memoryId})
              CREATE (o:Observation {
                content: $content,
                createdAt: $createdAt,
                source: $source,
                confidence: $confidence,
                embedding: $embedding
              })
              CREATE (m)-[:HAS_OBSERVATION]->(o)
              `,
              { 
                memoryId: memory.id, 
                content: observation,
                createdAt: now,
                source: null,
                confidence: 1.0,
                embedding
              }
            );
            obsIndex++;
          }
          
          // Create tag nodes and relationships
          for (const tag of tags) {
            // Create tag if it doesn't exist
            await tx.run(
              `
              MERGE (t:Tag {name: $tag})
              `,
              { tag }
            );
            
            // Create relationship to tag
            await tx.run(
              `
              MATCH (m:Memory {id: $memoryId})
              MATCH (t:Tag {name: $tag})
              CREATE (m)-[:HAS_TAG]->(t)
              `,
              { memoryId: memory.id, tag }
            );
          }

          createdMemories.push({
            id: memory.id,
            name: memory.name,
            memoryType: memory.memoryType,
            metadata: memory.metadata,
            createdAt: memory.createdAt,
            modifiedAt: memory.modifiedAt,
            lastAccessed: memory.lastAccessed,
            tags,
            observations: memory.observations
          });
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      return createdMemories;
    } catch (error) {
      this.logger.error("Error creating memories", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create relations
   * @param relations Array of relations to create
   * @returns Array of created relations
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    if (!this.initialized) await this.initialize();

    if (relations.length === 0) return [];

    // Validate that all memory IDs exist before proceeding
    const allMemoryIds = [...new Set([
      ...relations.map(r => r.fromId),
      ...relations.map(r => r.toId)
    ])];
    
    const session = this.getSession();
    const createdRelations: Relation[] = [];

    try {
      // Get all memory IDs that exist
      const memoryIdsResult = await session.run(`
        MATCH (m:Memory)
        WHERE m.id IN $ids
        RETURN collect(m.id) AS existingIds
      `, { ids: allMemoryIds });
      
      // Handle case where no memories exist or null result
      const memoryIds = new Set(
        memoryIdsResult && memoryIdsResult.records && memoryIdsResult.records.length > 0 
          ? memoryIdsResult.records[0].get("existingIds") || []
          : []
      );

      // Filter valid relations (both fromId and toId memories must exist)
      const validRelations = relations.filter(
        (relation) =>
          memoryIds.has(relation.fromId) && memoryIds.has(relation.toId)
      );

      if (validRelations.length === 0) {
        const invalidIds = allMemoryIds.filter(id => !memoryIds.has(id));
        throw new Error(`Cannot create relations: memory IDs do not exist: ${invalidIds.join(', ')}`);
      }

      // Warn about invalid relations if some were filtered out
      if (validRelations.length < relations.length) {
        const invalidRelations = relations.filter(
          (relation) =>
            !memoryIds.has(relation.fromId) || !memoryIds.has(relation.toId)
        );
        const invalidIds = [...new Set([
          ...invalidRelations.map(r => r.fromId),
          ...invalidRelations.map(r => r.toId)
        ])].filter(id => !memoryIds.has(id));
        console.warn(`Skipping relations with non-existent memory IDs: ${invalidIds.join(', ')}`);
      }

      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Check for existing relations to avoid duplicates
        for (const relation of validRelations) {
          const existingRelationResult = await tx.run(
            `
            MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
            RETURN count(r) AS count
            `,
            {
              fromId: relation.fromId,
              toId: relation.toId,
              relationType: relation.relationType,
            }
          );

          const count = existingRelationResult.records[0].get("count").toNumber();

          // Only create if relation doesn't exist
          if (count === 0) {
            await tx.run(
              `
              MATCH (from:Memory {id: $fromId})
              MATCH (to:Memory {id: $toId})
              CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)
              `,
              {
                fromId: relation.fromId,
                toId: relation.toId,
                relationType: relation.relationType,
              }
            );
            createdRelations.push(relation);
          }
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      return createdRelations;
    } catch (error) {
      this.logger.error("Error creating relations", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Add observations to memories
   * Pre-calculate embeddings before transaction to prevent conflicts
   * @param observations Array of observations to add
   * @returns Array of added observations
   */
  async addObservations(
    observations: Array<Observation>
  ): Promise<Observation[]> {
    if (!this.initialized) await this.initialize();
    if (observations.length === 0) return [];
    
    // Validate memory IDs exist before proceeding
    const memoryIds = [...new Set(observations.map(obs => obs.memoryId))];
    const session = this.getSession();
    
    try {
      // Check which memory IDs exist
      const existingIdsResult = await session.run(
        `MATCH (m:Memory) WHERE m.id IN $ids RETURN collect(m.id) AS existingIds`,
        { ids: memoryIds }
      );
      const existingIds = new Set(existingIdsResult.records[0]?.get('existingIds') || []);
      
      // Filter observations for existing memories only
      const validObservations = observations.filter(obs => existingIds.has(obs.memoryId));
      
      if (validObservations.length === 0) {
        throw new Error(`None of the specified memory IDs exist: ${memoryIds.join(', ')}`);
      }
      
      if (validObservations.length < observations.length) {
        const invalidIds = observations
          .filter(obs => !existingIds.has(obs.memoryId))
          .map(obs => obs.memoryId);
        // Note: Skipping observations for non-existent memory IDs
      }
    } finally {
      await session.close();
    }
    
    // Continue with the valid observations only
    const validObservationsToProcess = observations;
    
    // Pre-calculate ALL embeddings BEFORE transaction
    const precomputedEmbeddings = new Map<string, number[]>();
    
    for (const observation of validObservationsToProcess) {
      for (const content of observation.contents) {
        if (!precomputedEmbeddings.has(content)) {
          try {
            const embedding = await calculateEmbedding(content);
            precomputedEmbeddings.set(content, embedding);
          } catch (error) {
            // Failed to calculate embedding - continuing without
            precomputedEmbeddings.set(content, null);
          }
        }
      }
    }
    
    const transactionSession = this.getSession();
    const addedObservations: Observation[] = [];
    const now = new Date().toISOString();
    const memoriesToUpdate: Array<{id: string, name?: string, contents: string[]}> = [];

    try {
      // Begin transaction
      const tx = transactionSession.beginTransaction();

      try {
        // Process each observation set
        for (const observation of observations) {
          
          // Check if memory exists
          const memoryResult = await tx.run(
            `
            MATCH (m:Memory {id: $memoryId})
            RETURN m.name AS name
            `,
            { memoryId: observation.memoryId }
          );

          // Skip if memory doesn't exist
          if (memoryResult.records.length === 0) continue;

          const memoryName = memoryResult.records[0].get("name");

          // Update memory modifiedAt time
          await tx.run(
            `
            MATCH (m:Memory {id: $memoryId})
            SET m.modifiedAt = $timestamp
            `,
            { memoryId: observation.memoryId, timestamp: now }
          );

          // Get existing observations for this memory
          const existingObsResult = await tx.run(
            `
            MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
            RETURN o.content AS content
            `,
            { memoryId: observation.memoryId }
          );
          const existingObservations = new Set(
            existingObsResult.records.map((record) => record.get("content"))
          );

          // Filter new observations
          const newContents = observation.contents.filter(
            (content) => !existingObservations.has(content)
          );

          // Add new observations
          if (newContents.length > 0) {
            for (const content of newContents) {
              // Use precomputed embedding - NO calculation inside transaction
              const embedding = precomputedEmbeddings.get(content) || null;
              
              await tx.run(
                `
                MATCH (m:Memory {id: $memoryId})
                CREATE (o:Observation {
                  content: $content,
                  createdAt: $createdAt,
                  source: $source,
                  confidence: $confidence,
                  embedding: $embedding
                })
                CREATE (m)-[:HAS_OBSERVATION]->(o)
                `,
                { 
                  memoryId: observation.memoryId, 
                  content,
                  createdAt: now,
                  source: null,
                  confidence: 1.0,
                  embedding
                }
              );
            }

            addedObservations.push({
              memoryId: observation.memoryId,
              contents: newContents,
            });
            
            // Store memory info for tag updates after transaction
            memoriesToUpdate.push({
              id: observation.memoryId,
              name: memoryName,
              contents: newContents
            });
          }
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      // Update memory tags after adding observations (outside transaction)
      for (const memoryInfo of memoriesToUpdate) {
        const newSession = this.getSession();
        try {
          await processMemoryVectors(newSession, memoryInfo.id, memoryInfo.name, memoryInfo.contents);
        } finally {
          await newSession.close();
        }
      }

      return addedObservations;
    } catch (error) {
      this.logger.error("Error adding observations", extractError(error));
      throw error;
    } finally {
      await transactionSession.close();
    }
  }

  /**
   * Delete memories
   * @param memoryIds Array of memory IDs to delete
   */
  async deleteMemories(memoryIds: string[]): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (memoryIds.length === 0) return;

    const session = this.getSession();

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Delete memories and their relationships (Neo4j cascade)
        for (const memoryId of memoryIds) {
          // Delete observations
          await tx.run(
            `
            MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
            DETACH DELETE o
            `,
            { memoryId }
          );

          // Delete tag relationships
          await tx.run(
            `
            MATCH (m:Memory {id: $memoryId})-[r:HAS_TAG]->()
            DELETE r
            `,
            { memoryId }
          );

          // Delete relations
          await tx.run(
            `
            MATCH (m:Memory {id: $memoryId})-[r:RELATES_TO]-()
            DELETE r
            `,
            { memoryId }
          );

          await tx.run(
            `
            MATCH ()-[r:RELATES_TO]->(m:Memory {id: $memoryId})
            DELETE r
            `,
            { memoryId }
          );

          // Delete memory
          await tx.run(
            `
            MATCH (m:Memory {id: $memoryId})
            DELETE m
            `,
            { memoryId }
          );
        }
        
        // Clean up orphaned tags (no longer connected to any memory)
        await tx.run(`
          MATCH (t:Tag)
          WHERE NOT (t)<-[:HAS_TAG]-()
          DELETE t
        `);

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } catch (error) {
      this.logger.error("Error deleting memories", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete observations from memories
   * @param deletions Array of observations to delete
   */
  async deleteObservations(deletions: Array<Observation>): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (deletions.length === 0) return;

    const session = this.getSession();
    // Track memories that need tag updates
    const memoriesToUpdate = new Set<string>();

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Process each deletion
        for (const deletion of deletions) {
          if (deletion.contents.length > 0) {
            for (const content of deletion.contents) {
              await tx.run(
                `
                MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation {content: $content})
                DETACH DELETE o
                `,
                { memoryId: deletion.memoryId, content }
              );
            }
            
            // Mark this memory for tag update
            memoriesToUpdate.add(deletion.memoryId);
          }
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
      
      // Update tags for affected memories (outside transaction)
      for (const memoryId of memoriesToUpdate) {
        // Get memory name
        const memoryResult = await session.run(
          `MATCH (m:Memory {id: $memoryId}) RETURN m.name AS name`,
          { memoryId }
        );
        
        if (memoryResult.records.length > 0) {
          const name = memoryResult.records[0].get('name');
          
          // Get remaining observations
          const obsResult = await session.run(
            `MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation) 
             RETURN collect(o.content) AS observations`,
            { memoryId }
          );
          
          const observations = obsResult.records[0].get('observations').filter(Boolean);
          
          // Process vectors and tags with new session
          const newSession = this.getSession();
          try {
            await processMemoryVectors(newSession, memoryId, name, observations);
          } finally {
            await newSession.close();
          }
        }
      }
    } catch (error) {
      this.logger.error("Error deleting observations", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete relations
   * @param relations Array of relations to delete
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (relations.length === 0) return;

    const session = this.getSession();

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Delete each relation
        for (const relation of relations) {
          await tx.run(
            `
            MATCH (from:Memory {id: $fromId})-[r:RELATES_TO {relationType: $relationType}]->(to:Memory {id: $toId})
            DELETE r
            `,
            {
              fromId: relation.fromId,
              toId: relation.toId,
              relationType: relation.relationType,
            }
          );
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } catch (error) {
      this.logger.error("Error deleting relations", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Search for memories
   * @param query Search query
   * @returns Knowledge graph with matching memories and their relations
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();

    // Special case for wildcard "*" or empty string - return all memory summaries without observations
    if (query === "*" || query === "()" || !query || query.trim() === "") {
      const summaries = await this.getMemorySummaries();
      
      // Convert summaries to memories with empty observations
      const memories: MemoryResponse[] = summaries.map(summary => ({
        id: summary.id,
        name: summary.name,
        memoryType: summary.memoryType,
        observations: [] // Empty observations to keep it lightweight
      }));
      
      return { 
        memories,
        relations: [],
        _meta: {
          isLightweight: true,
          message: "This is a lightweight response. For detailed information about a specific memory, use the memory_retrieve tool with the memory ID."
        }
      };
    }

    const session = this.getSession();
    
    try {
      // First try enhanced unified search (always attempt vector-based search)
      try {
        // Create enhanced search instance with session - NOTE: memoryTypes not supported in this method
        const enhancedSearch = new EnhancedUnifiedSearch(session, {
          threshold: 0.1,
          weights: {
            vector: 0.5,
            metadataExact: 0.25,
            metadataFulltext: 0.15,
            tags: 0.1
          }
        });
        
        // No type filtering available in this legacy method
        const enhancedResults = await enhancedSearch.search(query, 10, true);
        
        // If enhanced search returned results, use those IDs
        if (enhancedResults.length > 0) {
          const memoryIds = enhancedResults.map(result => result.id);
          
          // Get full memories with observations for these IDs
          const memoriesResult = await session.run(
            `
            MATCH (m:Memory)
            WHERE m.id IN $ids
            
            // Core content with ordered observations
            OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
            OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
            
            RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType, 
                   m.metadata AS metadata,
                   m.createdAt AS createdAt, m.modifiedAt AS modifiedAt, m.lastAccessed AS lastAccessed,
                   // Sort observations chronologically (oldest first)
                   [obs IN collect(DISTINCT {content: o.content, createdAt: o.createdAt}) 
                    WHERE obs.content IS NOT NULL 
                    | obs] AS observationObjects,
                   collect(DISTINCT t.name) AS tags
            `,
            { ids: memoryIds }
          );

          // Convert Neo4j records to Memory objects and create a map for easy lookup
          const memoryMap = new Map<string, MemoryResponse>();
          memoriesResult.records.forEach((record) => {
            const id = record.get("id");
            const name = record.get("name");
            const memoryType = record.get("memoryType");
            const metadata = record.get("metadata") ? JSON.parse(record.get("metadata")) : undefined;
            const createdAt = record.get("createdAt");
            const modifiedAt = convertDateTimeToString(record.get("modifiedAt"));
            const lastAccessed = record.get("lastAccessed");
            // nameEmbedding is omitted - only used internally for vector search
            const tags = record.get("tags").filter(Boolean); // Remove null values
            
            // Extract and sort observations chronologically
            const observationObjects = record.get("observationObjects") || [];
            const observations = observationObjects
              .filter((obj: any) => obj && obj.content)
              .sort((a: any, b: any) => {
                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return timeA - timeB; // Ascending order (oldest first)
              })
              .map((obj: any) => obj.content);

            memoryMap.set(id, {
              id,
              name,
              memoryType,
              metadata,
              createdAt,
              modifiedAt,
              lastAccessed,
              // nameEmbedding omitted from response
              tags,
              observations,
            });
          });

          // Preserve the original order from vector search results
          const memories: MemoryResponse[] = memoryIds
            .map(id => memoryMap.get(id))
            .filter(memory => memory !== undefined) as MemoryResponse[];
          
          // Get related relations
          const relationsResult = await session.run(
            `
            MATCH (from:Memory)-[r:RELATES_TO]->(to:Memory)
            WHERE from.id IN $ids OR to.id IN $ids
            RETURN from.id AS fromId, to.id AS toId, r.relationType AS relationType
            `,
            { ids: memoryIds }
          );

          // Convert results to an array of Relation objects
          const relations = relationsResult.records.map((record) => {
            return {
              fromId: record.get("fromId"),
              toId: record.get("toId"),
              relationType: record.get("relationType"),
            };
          });

          return {
            memories,
            relations,
            _meta: {
              message: "Results from vector and tag-based search."
            }
          };
        }
      } catch (vectorError) {
        this.logger.error("Vector search error:", extractError(vectorError));
        // Continue to traditional search
      }
      
      // Fall back to empty results if vector search returned no results
      return { 
        memories: [], 
        relations: [],
        _meta: {
          message: "No results found."
        }
      };
    } catch (error) {
      this.logger.error("Error searching nodes", extractError(error));
      return { memories: [], relations: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Read the entire knowledge graph
   * @returns The complete knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();

    // Get all memories
    const memories = await this.getAllMemories();

    const session = this.getSession();
    try {
      // Get all relations
      const relationsResult = await session.run(
        `
        MATCH (from:Memory)-[r:RELATES_TO]->(to:Memory)
        RETURN from.id AS fromId, to.id AS toId, r.relationType AS relationType
        `
      );

      // Convert results to an array of Relation objects
      const relations = relationsResult.records.map((record) => {
        return {
          fromId: record.get("fromId"),
          toId: record.get("toId"),
          relationType: record.get("relationType"),
        };
      });

      return {
        memories,
        relations,
      };
    } catch (error) {
      this.logger.error("Error reading graph", extractError(error));
      return { memories: [], relations: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Get memories by ID
   * @param ids Array of memory IDs
   * @returns Knowledge graph with matching memories and their relations
   */
  async retrieveMemories(ids: string[]): Promise<MemoryGraph> {
    if (!this.initialized) await this.initialize();

    if (ids.length === 0) {
      return { memories: [], relations: [] };
    }
    
    const now = new Date().toISOString();
    const session = this.getSession();
    
    try {
      // Update lastAccessed timestamp for all requested memories
      const updateResult = await session.run(
        `
        MATCH (m:Memory)
        WHERE m.id IN $ids
        SET m.lastAccessed = $timestamp
        RETURN count(m) AS updated
        `,
        { ids, timestamp: now }
      );
      
      const updatedCount = updateResult.records[0]?.get('updated')?.toNumber() || 0;
      
      // Retrieve memories with graph context - 2 levels deep, same as search
      const memoriesResult = await session.run(
        `
        MATCH (m:Memory)
        WHERE m.id IN $ids
        
        // Graph context - 2 levels deep with correct relation types
        OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1*1..2]->(m)
        WHERE ancestor <> m AND ancestor.id IS NOT NULL
        
        OPTIONAL MATCH path2 = (m)-[rel2*1..2]->(descendant:Memory)
        WHERE descendant <> m AND descendant.id IS NOT NULL
        
        // Core content with observations and tags
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
        
        WITH m,
             collect(DISTINCT {
               id: ancestor.id,
               name: ancestor.name,
               type: ancestor.memoryType,
               relation: CASE WHEN rel1 IS NOT NULL AND size(rel1) > 0 THEN rel1[0].relationType ELSE 'RELATES_TO' END,
               distance: length(path1)
             })[0..3] as ancestors,
             collect(DISTINCT {
               id: descendant.id,
               name: descendant.name,
               type: descendant.memoryType,
               relation: CASE WHEN rel2 IS NOT NULL AND size(rel2) > 0 THEN rel2[0].relationType ELSE 'RELATES_TO' END,
               distance: length(path2)
             })[0..3] as descendants,
             o, t
        
        // Order observations chronologically
        WITH m, ancestors, descendants, t,
             collect(DISTINCT {content: o.content, createdAt: o.createdAt, source: o.source, confidence: o.confidence}) AS observationObjects
        ORDER BY m.id  
        
        RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType, 
               m.metadata AS metadata,
               m.createdAt AS createdAt, m.modifiedAt AS modifiedAt, m.lastAccessed AS lastAccessed,
               observationObjects,
               collect(DISTINCT t.name) AS tags,
               [item IN ancestors WHERE item.id IS NOT NULL] as filteredAncestors,
               [item IN descendants WHERE item.id IS NOT NULL] as filteredDescendants
        `,
        { ids }
      );

      // Convert Neo4j records to Memory objects with graph context
      const memories: Memory[] = memoriesResult.records.map((record) => {
        const id = record.get("id");
        const name = record.get("name");
        const memoryType = record.get("memoryType");
        const metadata = record.get("metadata") ? JSON.parse(record.get("metadata")) : undefined;
        const createdAt = record.get("createdAt");
        const modifiedAt = convertDateTimeToString(record.get("modifiedAt"));
        const lastAccessed = record.get("lastAccessed");
        // nameEmbedding is omitted - only used internally for vector search
        const tags = record.get("tags").filter(Boolean); // Remove null values
        
        // Extract observation objects with content and timestamps
        const observationObjects = record.get("observationObjects");
        let observations = [];
        
        if (observationObjects && Array.isArray(observationObjects)) {
          // Sort by createdAt timestamp to ensure chronological order (oldest first)
          observations = observationObjects
            .filter(o => o && o.content)  // Filter out nulls
            .sort((a, b) => {
              // Parse timestamps for comparison
              const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return timeA - timeB; // Ascending order (oldest first)
            })
            .map(o => ({
              content: o.content,
              createdAt: o.createdAt
            }));    // Return objects with content and createdAt
        }

        // Extract graph context
        const ancestors = record.get("filteredAncestors") || [];
        const descendants = record.get("filteredDescendants") || [];

        const memory: Memory = {
          id,
          name,
          memoryType,
          metadata,
          createdAt,
          modifiedAt,
          lastAccessed,
          // nameEmbedding omitted from response
          tags,
          observations,
        };

        // Add graph context if available
        if (ancestors.length > 0 || descendants.length > 0) {
          memory.related = {
            ancestors: ancestors.filter((item: any) => item && item.id),
            descendants: descendants.filter((item: any) => item && item.id)
          };
        }

        return memory;
      });
      const relationsResult = await session.run(
        `
        MATCH (from:Memory)-[r:RELATES_TO]->(to:Memory)
        WHERE from.id IN $ids OR to.id IN $ids
        RETURN from.id AS fromId, to.id AS toId, r.relationType AS relationType
        `,
        { ids }
      );

      // Convert results to an array of Relation objects
      const relations = relationsResult.records.map((record) => {
        return {
          fromId: record.get("fromId"),
          toId: record.get("toId"),
          relationType: record.get("relationType"),
        };
      });

      //console.error(`DEBUG: Found ${relations.length} relations`);

      const result = {
        memories,
        relations,
      };
      
      //console.error(`DEBUG: Final result: ${JSON.stringify(result, null, 2)}`);

      return result;
    } catch (error) {
      console.error(`DEBUG: Error in retrieveMemories:`, error);
      this.logger.error("Error retrieving memories", extractError(error));
      return { memories: [], relations: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Search memories by tags
   * @param tags Array of tags to search for
   * @returns Knowledge graph with matching memories and their relations
   */
  async searchMemoriesByTags(tags: string[]): Promise<MemoryGraph> {
    if (!this.initialized) await this.initialize();

    if (!tags || tags.length === 0) {
      return { memories: [], relations: [] };
    }
    
    const session = this.getSession();
    
    try {
      // Find memories with matching tags
      const memoriesResult = await session.run(
        `
        MATCH (m:Memory)-[:HAS_TAG]->(t:Tag)
        WHERE t.name IN $tags
        WITH m, count(DISTINCT t) AS tagMatches
        ORDER BY tagMatches DESC
        LIMIT 20
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        OPTIONAL MATCH (m)-[:HAS_TAG]->(t2:Tag)
        RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType, 
               m.metadata AS metadata,
               m.createdAt AS createdAt, m.modifiedAt AS modifiedAt, m.lastAccessed AS lastAccessed,
               collect(DISTINCT o.content) AS observations,
               collect(DISTINCT t2.name) AS tags
        `,
        { tags }
      );
      
      // Convert Neo4j records to Memory objects
      const memories: Memory[] = memoriesResult.records.map((record) => {
        const id = record.get("id");
        const name = record.get("name");
        const memoryType = record.get("memoryType");
        const metadata = record.get("metadata") ? JSON.parse(record.get("metadata")) : undefined;
        const createdAt = record.get("createdAt");
        const modifiedAt = convertDateTimeToString(record.get("modifiedAt"));
        const lastAccessed = record.get("lastAccessed");
        // nameEmbedding is omitted - only used internally for vector search
        const observations = record.get("observations").filter(Boolean); // Remove null values
        const memoryTags = record.get("tags").filter(Boolean); // Remove null values

        return {
          id,
          name,
          memoryType,
          metadata,
          createdAt,
          modifiedAt,
          lastAccessed,
          // nameEmbedding omitted from response
          tags: memoryTags,
          observations,
        };
      });
      
      const memoryIds = memories.map((memory) => memory.id);

      if (memoryIds.length === 0) {
        return { memories: [], relations: [] };
      }
      
      // Get related relations
      const relationsResult = await session.run(
        `
        MATCH (from:Memory)-[r:RELATES_TO]->(to:Memory)
        WHERE from.id IN $ids OR to.id IN $ids
        RETURN from.id AS fromId, to.id AS toId, r.relationType AS relationType
        `,
        { ids: memoryIds }
      );

      // Convert results to an array of Relation objects
      const relations = relationsResult.records.map((record) => {
        return {
          fromId: record.get("fromId"),
          toId: record.get("toId"),
          relationType: record.get("relationType"),
        };
      });

      return {
        memories,
        relations,
        _meta: {
          message: `Showing memories with tags: ${tags.join(', ')}`
        }
      };
    } catch (error) {
      this.logger.error("Error searching by tags", extractError(error));
      return { memories: [], relations: [] };
    } finally {
      await session.close();
    }
  }

  async getMemorySummaries(): Promise<{ id: string; name: string; memoryType: string; children?: { id: string; name: string; memoryType: string }[] }[]> {
    if (!this.initialized) await this.initialize();

    const session = this.getSession();
    const targetTotal = 20; // Target number of total memories to include in response
    let totalCollected = 0;
    const result = [];
    
    try {
      // Find all top-level memories (those with no incoming relations)
      const topLevelResult = await session.run(`
        MATCH (m:Memory)
        WHERE NOT ()-[:RELATES_TO]->(m)
        RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType
        ORDER BY m.name
      `);

      const topLevelMemories = topLevelResult.records.map(record => ({
        id: record.get("id"),
        name: record.get("name"),
        memoryType: record.get("memoryType")
      }));

      totalCollected = topLevelMemories.length;

      // If we already have enough at top level, return them all
      if (totalCollected >= targetTotal) {
        return topLevelMemories.map(memory => ({
          id: memory.id,
          name: memory.name,
          memoryType: memory.memoryType
        }));
      }

      // Otherwise, expand with children until we reach target
      for (const parent of topLevelMemories) {
        // Get direct children of this parent
        const childrenResult = await session.run(`
          MATCH (parent:Memory {id: $parentId})-[:RELATES_TO]->(child:Memory)
          RETURN child.id AS id, child.name AS name, child.memoryType AS memoryType
          ORDER BY child.name
        `, { parentId: parent.id });
        
        const children = childrenResult.records.map(childRecord => ({
          id: childRecord.get("id"),
          name: childRecord.get("name"),
          memoryType: childRecord.get("memoryType")
        }));
        
        // Create parent entry with children if any exist
        const parentEntry: any = {
          id: parent.id,
          name: parent.name,
          memoryType: parent.memoryType
        };
        
        if (children.length > 0) {
          parentEntry.children = children;
          totalCollected += children.length;
        }
        
        result.push(parentEntry);
        
        // Check if we need to go deeper by expanding children's children
        if (totalCollected < targetTotal && children.length > 0) {
          for (let i = 0; i < parentEntry.children.length && totalCollected < targetTotal; i++) {
            const child = parentEntry.children[i];
            
            // Get grandchildren
            const grandChildrenResult = await session.run(`
              MATCH (parent:Memory {id: $parentId})-[:RELATES_TO]->(grandchild:Memory)
              RETURN grandchild.id AS id, grandchild.name AS name, grandchild.memoryType AS memoryType
              ORDER BY grandchild.name
            `, { parentId: child.id });
            
            const grandChildren = grandChildrenResult.records.map(gcRecord => ({
              id: gcRecord.get("id"),
              name: gcRecord.get("name"),
              memoryType: gcRecord.get("memoryType")
            }));
            
            if (grandChildren.length > 0) {
              // Limit grandchildren to not exceed target
              const allowedGrandChildren = Math.min(
                grandChildren.length, 
                targetTotal - totalCollected
              );
              
              child.children = grandChildren.slice(0, allowedGrandChildren);
              totalCollected += allowedGrandChildren;
            }
          }
        }
      }

      return result;
    } catch (error) {
      this.logger.error("Error getting adaptive hierarchical memory summaries", extractError(error));
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Update metadata for a specific memory
   * @param memoryId The ID of the memory to update
   * @param metadata New metadata object
   */
  async updateMemoryMetadata(memoryId: string, metadata: Record<string, any>): Promise<void> {
    if (!this.initialized) await this.initialize();

    const session = this.getSession();
    const now = new Date().toISOString();
    
    try {
      // Verify memory exists first
      const checkResult = await session.run(
        `MATCH (m:Memory {id: $memoryId}) RETURN m.id AS id`,
        { memoryId }
      );
      
      if (checkResult.records.length === 0) {
        throw new Error(`Memory with ID ${memoryId} not found`);
      }
      
      // Update metadata using direct session, not transaction wrapper
      await session.run(`
        MATCH (m:Memory {id: $memoryId})
        SET m.metadata = $metadata,
            m.modifiedAt = $modifiedAt
        RETURN m
      `, { 
        memoryId, 
        metadata: JSON.stringify(metadata),
        modifiedAt: now
      });
      
      this.logger.info(`Successfully updated metadata for memory ${memoryId}`);
    } catch (error) {
      this.logger.error("Error updating memory metadata", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Update name for a specific memory
   * @param memoryId The ID of the memory to update
   * @param name New name for the memory
   */
  async updateMemoryName(memoryId: string, name: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    const session = this.getSession();
    const now = new Date().toISOString();
    
    try {
      // Verify memory exists first
      const checkResult = await session.run(
        `MATCH (m:Memory {id: $memoryId}) RETURN m.id AS id`,
        { memoryId }
      );
      
      if (checkResult.records.length === 0) {
        throw new Error(`Memory with ID ${memoryId} not found`);
      }

      // Calculate new name embedding before transaction
      const nameEmbedding = await calculateEmbedding(name);
      
      // Extract new tags from name
      const tags = await extractTags(name, session);
      
      // Update name, nameEmbedding, tags, and modifiedAt in a transaction
      const tx = session.beginTransaction();
      
      try {
        // Update memory properties
        await tx.run(`
          MATCH (m:Memory {id: $memoryId})
          SET m.name = $name,
              m.nameEmbedding = $nameEmbedding,
              m.tags = $tags,
              m.modifiedAt = $modifiedAt
          RETURN m
        `, { 
          memoryId, 
          name,
          nameEmbedding,
          tags,
          modifiedAt: now
        });

        // Clear existing tag relationships
        await tx.run(`
          MATCH (m:Memory {id: $memoryId})-[r:HAS_TAG]->()
          DELETE r
        `, { memoryId });

        // Create new tag nodes and relationships
        for (const tag of tags) {
          // Create tag if it doesn't exist
          await tx.run(`
            MERGE (t:Tag {name: $tag})
          `, { tag });
          
          // Create relationship to tag
          await tx.run(`
            MATCH (m:Memory {id: $memoryId})
            MATCH (t:Tag {name: $tag})
            CREATE (m)-[:HAS_TAG]->(t)
          `, { memoryId, tag });
        }

        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
      
      this.logger.info(`Successfully updated name for memory ${memoryId}`);
    } catch (error) {
      this.logger.error("Error updating memory name", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Update memoryType for a specific memory
   * @param memoryId The ID of the memory to update
   * @param memoryType New memoryType for the memory
   */
  async updateMemoryType(memoryId: string, memoryType: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    const session = this.getSession();
    const now = new Date().toISOString();
    
    try {
      // Verify memory exists first
      const checkResult = await session.run(
        `MATCH (m:Memory {id: $memoryId}) RETURN m.id AS id`,
        { memoryId }
      );
      
      if (checkResult.records.length === 0) {
        throw new Error(`Memory with ID ${memoryId} not found`);
      }
      
      // Update memoryType using direct session
      await session.run(`
        MATCH (m:Memory {id: $memoryId})
        SET m.memoryType = $memoryType,
            m.modifiedAt = $modifiedAt
        RETURN m
      `, { 
        memoryId, 
        memoryType,
        modifiedAt: now
      });
      
      this.logger.info(`Successfully updated memoryType for memory ${memoryId}`);
    } catch (error) {
      this.logger.error("Error updating memory type", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Search memories by metadata content
   * @param query Search query for metadata
   * @param memoryType Optional filter by memory type  
   * @returns Memory graph with matching memories and their relations
   */
  async searchMemoriesByMetadata(query: string, memoryType?: string): Promise<MemoryGraph> {
    if (!this.initialized) await this.initialize();

    const session = this.getSession();
    try {
      let cypher = `
        CALL db.index.fulltext.queryNodes("memory_metadata_idx", $query) YIELD node, score
        WITH node AS m, score
        WHERE m:Memory
      `;
      
      if (memoryType) {
        cypher += ` AND m.memoryType = $memoryType`;
      }
      
      cypher += `
        OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
        OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
        RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType,
               m.metadata AS metadata, m.createdAt AS createdAt,
               m.modifiedAt AS modifiedAt, m.lastAccessed AS lastAccessed,
               m.nameEmbedding AS nameEmbedding,
               collect(DISTINCT o.content) AS observations,
               collect(DISTINCT t.name) AS tags,
               score
        ORDER BY score DESC
        LIMIT 100
      `;
      
      const result = await session.run(cypher, { query, memoryType });
      
      const memories = result.records.map(record => ({
        id: record.get('id'),
        name: record.get('name'),
        memoryType: record.get('memoryType'),
        metadata: record.get('metadata') ? JSON.parse(record.get('metadata')) : undefined,
        createdAt: record.get('createdAt'),
        modifiedAt: convertDateTimeToString(record.get('modifiedAt')),
        lastAccessed: record.get('lastAccessed'),
        nameEmbedding: record.get('nameEmbedding'),
        tags: record.get('tags').filter(Boolean) || [], // Filter out null values
        observations: record.get('observations').filter(Boolean) || [] // Filter out null values
      }));
      
      // Convert to MemoryGraph format
      return {
        memories,
        relations: [],
        _meta: {
          message: `Found ${memories.length} memories matching metadata query: ${query}`
        }
      };
    } catch (error) {
      this.logger.error("Error searching memories by metadata", extractError(error));
      return { 
        memories: [], 
        relations: [],
        _meta: {
          message: "Error searching metadata - fulltext index may not be available."
        }
      };
    } finally {
      await session.close();
    }
  }

  async searchMemories(query: string, memoryTypes?: string[], limit?: number, threshold: number = 0.1, includeGraphContext: boolean = true): Promise<MemoryGraph> {
    if (!this.initialized) await this.initialize();

    // Ensure indexes exist before attempting search operations
    // Critical for fresh databases that may not have been properly initialized
    const indexSession = this.getSession();
    try {
      await ensureVectorIndexes(indexSession);
    } catch (error) {
      // Index creation failed - continue with search but note the issue
      this.logger.error("Failed to ensure indexes during search", extractError(error));
    } finally {
      await indexSession.close();
    }

    // Special case for wildcard "*" or empty string - return lightweight summaries with limit and type filtering
    if (query === "*" || query === "()" || !query || query.trim() === "") {
      const summaries = await this.getMemorySummaries();
      
      let memories: MemoryResponse[] = summaries.map(summary => ({
        id: summary.id,
        name: summary.name,
        memoryType: summary.memoryType,
        observations: []
      }));
      
      // Apply memory type filtering if specified  
      if (memoryTypes && memoryTypes.length > 0) {
        memories = memories.filter(memory => memoryTypes.includes(memory.memoryType));
      }
      
      // Apply limit if specified
      if (limit !== undefined && limit !== null && limit >= 0) {
        memories = memories.slice(0, limit);
      }
      
      return { 
        memories,
        relations: [],
        _meta: {
          isLightweight: true,
          message: "Lightweight response. Use memory_retrieve for detailed information."
        }
      };
    }

    const startTime = Date.now();
    const session = this.getSession();
    
    try {
      // Use enhanced unified search engine
      const enhancedSearch = new EnhancedUnifiedSearch(session, {
        threshold,
        weights: {
          vector: 0.5,
          metadataExact: 0.25,
          metadataFulltext: 0.15,
          tags: 0.1
        }
      });
      
      // Apply default limit if not specified
      const actualLimit = limit !== undefined && limit !== null ? limit : 10;
      
      const results = await enhancedSearch.search(query, actualLimit, includeGraphContext, memoryTypes);
      const queryTime = Date.now() - startTime;
      
      // Get related relations for found memories
      if (results.length > 0) {
        const memoryIds = results.map(r => r.id);
        const relationsResult = await session.run(
          `
          MATCH (from:Memory)-[r:RELATES_TO]->(to:Memory)
          WHERE from.id IN $ids OR to.id IN $ids
          RETURN from.id AS fromId, to.id AS toId, r.relationType AS relationType
          `,
          { ids: memoryIds }
        );

        const relations = relationsResult.records.map((record) => ({
          fromId: record.get("fromId"),
          toId: record.get("toId"),
          relationType: record.get("relationType"),
        }));

        return {
          memories: results,
          relations,
          _meta: {
            queryTime,
            message: "Enhanced search with metadata exact matching and graph context"
          }
        };
      }
      
      return {
        memories: [],
        relations: [],
        _meta: {
          queryTime,
          message: (limit !== undefined && limit !== null && limit === 0) ? "Limited to 0 results" : "No results found."
        }
      };
    } catch (error) {
      this.logger.error("Enhanced search failed:", extractError(error));
      
      // Fallback to filtered wildcard search that respects memory types
      const summaries = await this.getMemorySummaries();
      
      let memories: MemoryResponse[] = summaries.map(summary => ({
        id: summary.id,
        name: summary.name,
        memoryType: summary.memoryType,
        observations: []
      }));
      
      // Apply memory type filtering if specified  
      if (memoryTypes && memoryTypes.length > 0) {
        memories = memories.filter(memory => memoryTypes.includes(memory.memoryType));
      }
      
      // Apply limit if specified
      const actualLimit = limit !== undefined && limit !== null ? limit : 10;
      memories = memories.slice(0, actualLimit);
      
      return {
        memories,
        relations: [],
        _meta: {
          message: "Fallback search used due to enhanced search failure."
        }
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Close the connection to Neo4j
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }
}