/**
 * Database Index Management - REALITY-BASED IMPLEMENTATION
 * Single responsibility: Neo4j index and constraint operations
 * GDD v2.3.1: Only indexes that are ACTUALLY USED in queries
 */

import { Session } from 'neo4j-driver';

export class IndexManager {
  constructor(private session: Session) {}

  /**
   * Ensure all required constraints exist
   * GDD v2.3.1: Added critical Observation.id constraint
   */
  async ensureConstraints(): Promise<void> {
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
        console.error(`[IndexManager] Constraint failed: ${constraint}`, error);
        throw error; // Fail fast - no silent failures
      }
    }
  }

  /**
   * Ensure ACTIVE indexes exist (verified query usage)
   * GDD v2.3.1: Removed dead indexes, added missing critical ones
   */
  async ensureActiveIndexes(): Promise<void> {
    const activeIndexes = [
      // VERIFIED USAGE: wildcard-search-service.ts, vector-search-channel.ts
      // Pattern: WHERE m.memoryType IN $memoryTypes
      'CREATE INDEX memory_type_idx IF NOT EXISTS FOR (m:Memory) ON (m.memoryType)',
      
      // VERIFIED USAGE: All search result ordering
      // Pattern: ORDER BY m.createdAt DESC
      'CREATE INDEX memory_created_idx IF NOT EXISTS FOR (m:Memory) ON (m.createdAt)',
      
      // NEW: Enhanced relationship metadata support (GDD v2.3.1)
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
        console.error(`[IndexManager] Active index failed: ${index}`, error);
        throw error; // Fail fast - no silent failures
      }
    }
  }

  /**
   * Ensure fulltext indexes exist
   * GDD v2.3.1: Maintained for proper FULLTEXT usage
   */
  async ensureFulltextIndexes(): Promise<void> {
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
        console.error(`[IndexManager] Fulltext index failed: ${index}`, error);
        throw error; // Fail fast - no silent failures
      }
    }
  }

  /**
   * Ensure vector indexes exist (GDS Plugin)
   * GDD v2.3.1: VERIFIED USAGE in vector-search-channel.ts
   */
  async ensureVectorIndexes(): Promise<void> {
    try {
      // Import here to avoid circular dependencies
      const { SmartEmbeddingManager } = await import('../services/smart-embedding-manager');
      const embeddingManager = new SmartEmbeddingManager();
      
      // Get dimensions dynamically from the configured model
      const dimensions = await embeddingManager.getModelDimensions();
      
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
      // Expected for Community Edition - vector search will use in-memory calculation
      console.warn('[IndexManager] Vector indexes not available (Community Edition or GDS not installed)');
    }
  }

  /**
   * Remove dead indexes from legacy implementations
   * GDD v2.3.1: Cleanup unused indexes to improve performance
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
        console.log(`[IndexManager] Removed dead index: ${indexName}`);
      } catch (error) {
        // Index might not exist - continue cleanup
        console.warn(`[IndexManager] Could not remove ${indexName}:`, error);
      }
    }
  }

  /**
   * Check if required schema elements exist
   * GDD v2.3.1: Updated to check for reality-based schema
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
      console.warn(`[IndexManager] Schema check failed, assuming missing: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Assume schema is missing if we can't check
    }
  }

  /**
   * Initialize all database schema elements
   * GDD v2.3.1: Reality-based initialization with dead index cleanup
   */
  async initializeSchema(): Promise<void> {
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
      
      console.log('[IndexManager] Schema initialization COMPLETE - reality-based indexes only');
    } catch (error) {
      console.error("[IndexManager] Schema initialization FAILED:", error);
      throw error; // Fail fast - no silent failures
    }
  }
}
