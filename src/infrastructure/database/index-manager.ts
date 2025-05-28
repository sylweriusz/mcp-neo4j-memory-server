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
      'CREATE CONSTRAINT IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (o:Observation) REQUIRE o.id IS UNIQUE'
    ];

    for (const constraint of constraints) {
      try {
        await this.session.run(constraint);
        console.error(`[IndexManager] ✅ Constraint created: ${constraint}`);
      } catch (error) {
        console.error(`[IndexManager] ❌ Constraint failed: ${constraint}`, error);
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
      'CREATE INDEX relation_type_idx IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.relationType)',
      'CREATE INDEX tag_name_idx IF NOT EXISTS FOR (t:Tag) ON (t.name)'
    ];

    for (const index of indexes) {
      try {
        await this.session.run(index);
        console.error(`[IndexManager] ✅ Index created: ${index}`);
      } catch (error) {
        console.error(`[IndexManager] ❌ Index failed: ${index}`, error);
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
        console.error(`[IndexManager] ✅ Fulltext index created: ${index}`);
      } catch (error) {
        console.error(`[IndexManager] ❌ Fulltext index failed: ${index}`, error);
        throw error; // Re-throw to fail fast
      }
    }
  }

  /**
   * Ensure vector indexes exist (Enterprise Edition)
   * GDD Requirement: Vector index for semantic search
   */
  async ensureVectorIndexes(): Promise<void> {
    try {
      // Try creating vector index for Enterprise Edition
      const vectorIndex = `
        CREATE VECTOR INDEX memory_name_vector_idx IF NOT EXISTS 
        FOR (m:Memory) ON (m.nameEmbedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: 768,
          \`vector.similarity_function\`: 'cosine'
        }}
      `;
      await this.session.run(vectorIndex);
      console.error("[IndexManager] ✅ Vector index created successfully");
    } catch (error) {
      console.warn("[IndexManager] ⚠️  Vector index creation failed (likely Community Edition):", error.message);
      // This is expected for Community Edition - vector search will use in-memory calculation
    }
  }

  /**
   * Initialize all database schema elements
   * GDD Compliant: All required indexes per section 5.2
   */
  async initializeSchema(): Promise<void> {
    console.error("[IndexManager] 🚀 Starting schema initialization...");
    try {
      await this.ensureConstraints();
      await this.ensureIndexes();
      await this.ensureFulltextIndexes();
      await this.ensureVectorIndexes();
      console.error("[IndexManager] ✅ Schema initialization completed successfully");
    } catch (error) {
      console.error("[IndexManager] ❌ Schema initialization FAILED:", error);
      throw error; // Fail fast - no silent failures
    }
  }
}
