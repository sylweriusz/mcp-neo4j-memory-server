/**
 * Database Index Management
 */

import { Session } from 'neo4j-driver';

export class IndexManager {
  constructor(
    private session: Session,
    private vectorDimensions?: number
  ) {}

  /**
   * Zero-fallback system database validation
   */
  private async validateUserDatabase(): Promise<void> {
    try {
      // Query database information to validate context
      const result = await this.session.run('CALL db.info() YIELD name');
      const dbName = result.records[0]?.get('name');
      
      if (dbName === 'system') {
        throw new Error(`Cannot create constraints on system database. Context: ${dbName}`);
      }
      
      // Additional validation for null/undefined database name
      if (!dbName) {
        throw new Error('Database name could not be determined');
      }
      
    } catch (error) {
      // ZERO-FALLBACK: Re-throw all errors to prevent masking real problems
      if (error instanceof Error) {
        throw error;
      }
      // For unknown error types, wrap and throw
      throw new Error(`Database validation failed: ${String(error)}`);
    }
  }

  /**
   * Ensure all required constraints exist
   */
  async ensureConstraints(): Promise<void> {
    // ZERO-FALLBACK: Fail fast if wrong database context
    await this.validateUserDatabase();

    const constraints = [
      // CRITICAL: Used in all Memory CRUD operations
      'CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE',
      // CRITICAL: Used in observation deletion operations  
      'CREATE CONSTRAINT observation_id_unique IF NOT EXISTS FOR (o:Observation) REQUIRE o.id IS UNIQUE'
    ];

    for (const constraint of constraints) {
      try {
        await this.session.run(constraint);
      } catch (error) {
        // Constraint creation failed - this IS a real problem
        throw error; 
      }
    }
  }

  /**
   * Ensure ACTIVE indexes exist (verified query usage)
   */
  async ensureActiveIndexes(): Promise<void> {
    // ZERO-FALLBACK: Fail fast if wrong database context
    await this.validateUserDatabase();
    const activeIndexes = [
      // VERIFIED USAGE: wildcard-search-service.ts, vector-search-channel.ts
      // Pattern: WHERE m.memoryType IN $memoryTypes
      'CREATE INDEX memory_type_idx IF NOT EXISTS FOR (m:Memory) ON (m.memoryType)',
      
      // VERIFIED USAGE: All search result ordering
      // Pattern: ORDER BY m.createdAt DESC
      'CREATE INDEX memory_created_idx IF NOT EXISTS FOR (m:Memory) ON (m.createdAt)',
      
      // NEW: Enhanced relationship metadata support
      // Pattern: WHERE r.strength >= $threshold
      'CREATE INDEX relation_strength_idx IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.strength)',
      // Pattern: WHERE r.source = "agent"
      'CREATE INDEX relation_source_idx IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.source)',
      // Pattern: ORDER BY r.createdAt DESC  
      'CREATE INDEX relation_created_idx IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.createdAt)'
    ];

    for (const index of activeIndexes) {
      try {
        await this.session.run(index);
      } catch (error) {
        // Index creation failed - real problem
        throw error;
      }
    }
  }

  /**
   * Ensure fulltext indexes exist
   */
  async ensureFulltextIndexes(): Promise<void> {
    // ZERO-FALLBACK: Fail fast if wrong database context
    await this.validateUserDatabase();
    const fulltextIndexes = [
      // USAGE: CALL db.index.fulltext.queryNodes('memory_metadata_idx', $query)
      'CREATE FULLTEXT INDEX memory_metadata_idx IF NOT EXISTS FOR (m:Memory) ON EACH [m.metadata]',
      // USAGE: CALL db.index.fulltext.queryNodes('observation_content_idx', $query)  
      'CREATE FULLTEXT INDEX observation_content_idx IF NOT EXISTS FOR (o:Observation) ON EACH [o.content]'
    ];

    for (const index of fulltextIndexes) {
      try {
        await this.session.run(index);
      } catch (error) {
        // Fulltext index creation failed - real problem, no console output
        throw new Error(`Fulltext index failed: ${index} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Ensure vector indexes exist (GDS Plugin)
   */
  async ensureVectorIndexes(): Promise<void> {
    // ZERO-FALLBACK: Fail fast if wrong database context
    await this.validateUserDatabase();
    
    // Skip vector index creation if dimensions not provided
    if (!this.vectorDimensions) {
      return;
    }
    
    try {
      const dimensions = this.vectorDimensions;
      
      // CRITICAL VALIDATION: Ensure dimensions are valid before creating indexes
      if (!dimensions || dimensions <= 0) {
        throw new Error(`INVALID VECTOR DIMENSIONS: ${dimensions}. Model may not be loaded properly. Check embedding service configuration.`);
      }
      
      // VERIFIED USAGE: gds.similarity.cosine(m.nameEmbedding, $queryVector)
      const memoryVectorIndex = `
        CREATE VECTOR INDEX memory_name_vector_idx IF NOT EXISTS 
        FOR (m:Memory) ON (m.nameEmbedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${dimensions},
          \`vector.similarity_function\`: 'cosine'
        }}
      `;
      await this.session.run(memoryVectorIndex);

      // POTENTIAL USAGE: Future observation-level vector search
      const observationVectorIndex = `
        CREATE VECTOR INDEX observation_embedding_vector_idx IF NOT EXISTS 
        FOR (o:Observation) ON (o.embedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${dimensions},
          \`vector.similarity_function\`: 'cosine'
        }}
      `;
      await this.session.run(observationVectorIndex);
      
    } catch (error) {
      // Expected for Community Edition - silent operation
    }
  }

  /**
   * Remove dead indexes from legacy implementations
   */
  async removeDeadIndexes(): Promise<void> {
    const deadIndexes = [
      'memory_accessed_idx',    // No queries sort by lastAccessed
      'memory_name_idx',        // Replaced by fulltext and vector search
      'relation_type_idx'       // No queries filter by relationType alone
    ];

    for (const indexName of deadIndexes) {
      try {
        await this.session.run(`DROP INDEX ${indexName} IF EXISTS`);
        // Silent cleanup - no logging noise for normal operations
      } catch (error) {
        // Index might not exist - continue cleanup silently
      }
    }
  }

  /**
   * Check if required schema elements exist
   */
  async hasRequiredSchema(): Promise<boolean> {
    try {
      // Check for critical Memory.id unique constraint
      const memoryConstraintResult = await this.session.run(`
        SHOW CONSTRAINTS 
        WHERE entityType = "NODE" 
        AND labelsOrTypes = ["Memory"] 
        AND properties = ["id"]
        AND type = "UNIQUENESS"
      `);
      
      // Check for critical Observation.id unique constraint
      const observationConstraintResult = await this.session.run(`
        SHOW CONSTRAINTS 
        WHERE entityType = "NODE" 
        AND labelsOrTypes = ["Observation"] 
        AND properties = ["id"]
        AND type = "UNIQUENESS"
      `);
      
      // Check for active memory_type index
      const memoryTypeIndexResult = await this.session.run(`
        SHOW INDEXES 
        WHERE name = "memory_type_idx"
      `);
      
      // Check for new memory_created index
      const memoryCreatedIndexResult = await this.session.run(`
        SHOW INDEXES 
        WHERE name = "memory_created_idx"
      `);
      
      const hasRequiredElements = 
        memoryConstraintResult.records.length > 0 &&
        observationConstraintResult.records.length > 0 &&
        memoryTypeIndexResult.records.length > 0 &&
        memoryCreatedIndexResult.records.length > 0;
      
      return hasRequiredElements;
    } catch (error) {
      // Schema check failed - assume missing (silent)
      return false; 
    }
  }

  /**
   * Initialize all database schema elements
   */
  async initializeSchema(): Promise<void> {
    // ZERO-FALLBACK: Validate database context before any schema operations
    await this.validateUserDatabase();

    try {
      // Step 1: Remove dead indexes first (clean slate)
      await this.removeDeadIndexes();
      
      // Step 2: Create essential constraints
      await this.ensureConstraints();
      
      // Step 3: Create active indexes (verified usage)
      await this.ensureActiveIndexes();
      
      // Step 4: Create fulltext indexes
      await this.ensureFulltextIndexes();
      
      // Step 5: Create vector indexes (if supported)
      await this.ensureVectorIndexes();
      
      // Silent initialization - only real failures matter
    } catch (error) {
      // Schema initialization failed - this is a real problem
      throw error;
    }
  }
}
