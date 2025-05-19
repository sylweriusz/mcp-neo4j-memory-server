/**
 * Neo4j Index Management
 * Creates and maintains database indexes for optimal performance
 */

import { Session } from 'neo4j-driver';
import { detectSupport } from './detection';

/**
 * Initialize all required indexes
 * @param session Neo4j session
 */
export async function createIndexes(session: Session): Promise<void> {
  // Check if indexes already exist before attempting creation
  const existingIndexes = await getExistingIndexes(session);
  
  if (existingIndexes.size === 0) {
    const support = await detectSupport(session);
    
    // Core indexes - always created
    await createCoreIndexes(session);
    
    // Vector indexes - based on capabilities
    await createVectorIndexes(session, support);
  }
}

/**
 * Get list of existing indexes
 */
async function getExistingIndexes(session: Session): Promise<Set<string>> {
  try {
    const result = await session.run(`SHOW INDEXES`);
    const indexes = new Set<string>();
    
    result.records.forEach(record => {
      const indexName = record.get('name');
      if (indexName) {
        indexes.add(indexName);
      }
    });
    
    return indexes;
  } catch (error) {
    // If we can't check indexes, assume none exist and create them all
    return new Set();
  }
}

/**
 * Create essential indexes
 */
async function createCoreIndexes(session: Session): Promise<void> {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS FOR (t:Tag) ON (t.name)`,
    // Tag embedding cache indexes
    `CREATE INDEX IF NOT EXISTS FOR (t:Tag) ON (t.embeddingVersion)`,
    `CREATE INDEX IF NOT EXISTS FOR (t:Tag) ON (t.calculatedAt)`
  ];

  // Create basic indexes first
  for (const index of indexes) {
    try {
      await session.run(index);
    } catch (error) {
      // Silent failure - we're in an MCP environment where console output must be clean
      // Log to stderr if needed, but don't pollute stdout with non-JSON
    }
  }

  // Handle fulltext index separately with explicit error handling
  try {
    // Drop existing fulltext index if it exists (in case it's corrupted)
    await session.run(`DROP INDEX memory_metadata_idx IF EXISTS`);
    
    // Create the fulltext index fresh
    await session.run(`
      CREATE FULLTEXT INDEX memory_metadata_idx 
      FOR (m:Memory) 
      ON EACH [m.metadata]
    `);
    //console.error('DEBUG: Created fulltext index memory_metadata_idx');
  } catch (error) {
    console.error(`DEBUG: Fulltext index creation failed: ${error.message}`);
    // Don't throw - continue without fulltext support
  }
}

/**
 * Create vector-specific indexes
 */
async function createVectorIndexes(session: Session, support: 'enterprise' | 'gds' | 'none'): Promise<void> {
  if (support === 'enterprise') {
    try {
      await session.run(`
        CREATE VECTOR INDEX IF NOT EXISTS memory_name_vector_idx 
        FOR (m:Memory) ON (m.nameEmbedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: 384,
          \`vector.similarity_function\`: 'cosine'
        }}
      `);
    } catch (error) {
      // Vector index creation can fail in some environments - continue silently
    }
  } else if (support === 'gds') {
    try {
      await session.run(`CREATE INDEX IF NOT EXISTS FOR (m:Memory) ON (m.nameEmbedding)`);
    } catch (error) {
      // Embedding index creation can fail - continue silently
    }
  }
  // No special indexes needed for 'none' support
}
