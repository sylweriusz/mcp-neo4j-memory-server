/**
 * Database Index Management
 * Single responsibility: Neo4j index and constraint operations
 */

import { Session } from 'neo4j-driver';

export class IndexManager {
  constructor(private session: Session) {}

  /**
   * Ensure all required constraints exist
   */
  async ensureConstraints(): Promise<void> {
    const constraints = [
      'CREATE CONSTRAINT IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (o:Observation) REQUIRE o.id IS UNIQUE'
    ];

    for (const constraint of constraints) {
      try {
        await this.session.run(constraint);
      } catch (error) {
        console.error(`[IndexManager] Constraint failed: ${constraint}`, error);
        throw error; // Re-throw to fail fast
      }
    }
  }

  /**
   * Ensure all required indexes exist
   */
  async ensureIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX memory_type_idx IF NOT EXISTS FOR (m:Memory) ON (m.memoryType)',
      'CREATE INDEX memory_name_idx IF NOT EXISTS FOR (m:Memory) ON (m.name)',
      'CREATE INDEX memory_accessed_idx IF NOT EXISTS FOR (m:Memory) ON (m.lastAccessed)',
      'CREATE INDEX relation_type_idx IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.relationType)'
    ];

    for (const index of indexes) {
      try {
        await this.session.run(index);
      } catch (error) {
        console.error(`[IndexManager] Index failed: ${index}`, error);
        throw error; // Re-throw to fail fast
      }
    }
  }

  /**
   * Ensure fulltext indexes exist
   */
  async ensureFulltextIndexes(): Promise<void> {
    const fulltextIndexes = [
      'CREATE FULLTEXT INDEX memory_metadata_idx IF NOT EXISTS FOR (m:Memory) ON EACH [m.metadata]',
      'CREATE FULLTEXT INDEX observation_content_idx IF NOT EXISTS FOR (o:Observation) ON EACH [o.content]'
    ];

    for (const index of fulltextIndexes) {
      try {
        await this.session.run(index);
      } catch (error) {
        console.error(`[IndexManager] Fulltext index failed: ${index}`, error);
        throw error; // Re-throw to fail fast
      }
    }
  }

  /**
   * Ensure vector indexes exist (Enterprise Edition)
   * SIMPLIFIED: Only try Enterprise Edition vector indexes
   * If they fail, we'll use GDS or in-memory calculation
   */
  async ensureVectorIndexes(): Promise<void> {
    try {
      // Import here to avoid circular dependencies
      const { SmartEmbeddingManager } = await import('../services/smart-embedding-manager');
      const embeddingManager = new SmartEmbeddingManager();
      
      // Get dimensions dynamically from the configured model
      const dimensions = await embeddingManager.getModelDimensions();
      
      // Memory name vector index (Enterprise Edition only)
      const memoryVectorIndex = `
        CREATE VECTOR INDEX memory_name_vector_idx IF NOT EXISTS 
        FOR (m:Memory) ON (m.nameEmbedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${dimensions},
          \`vector.similarity_function\`: 'cosine'
        }}
      `;
      await this.session.run(memoryVectorIndex);

      // Observation embedding vector index (Enterprise Edition only)
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
      // Enterprise vector index creation failed - using GDS or in-memory calculation
      // Expected for Community Edition - vector search will use in-memory calculation
    }
  }

  /**
   * Check if required schema elements exist
   * Uses Memory.id constraint as key indicator of schema initialization
   */
  async hasRequiredSchema(): Promise<boolean> {
    try {
      // Check for critical Memory.id unique constraint
      const constraintResult = await this.session.run(`
        SHOW CONSTRAINTS 
        WHERE entityType = "NODE" 
        AND labelsOrTypes = ["Memory"] 
        AND properties = ["id"]
        AND type = "UNIQUENESS"
      `);
      
      const hasMemoryConstraint = constraintResult.records.length > 0;
      
      // Check for basic memory_type index
      const indexResult = await this.session.run(`
        SHOW INDEXES 
        WHERE name = "memory_type_idx"
      `);
      
      const hasMemoryTypeIndex = indexResult.records.length > 0;
      
      const schemaExists = hasMemoryConstraint && hasMemoryTypeIndex;
      
      return schemaExists;
    } catch (error) {
      console.warn(`[IndexManager] Schema check failed, assuming missing: ${error.message}`);
      return false; // Assume schema is missing if we can't check
    }
  }

  /**
   * Initialize all database schema elements
   * GDD Compliant: All required indexes per section 5.2
   */
  async initializeSchema(): Promise<void> {
    try {
      await this.ensureConstraints();
      await this.ensureIndexes();
      await this.ensureFulltextIndexes();
      await this.ensureVectorIndexes();
    } catch (error) {
      console.error("[IndexManager] Schema initialization FAILED:", error);
      throw error; // Fail fast - no silent failures
    }
  }
}
