/**
 * Vector Database Operations
 * Integration with Neo4j database
 */

import { Session } from 'neo4j-driver';
import { calculateEmbedding } from './embeddings';
import { updateMemoryTags } from './tags';
import { ensureVectorIndexes } from './search';

/**
 * Initialize vector capabilities for database
 * @param session Neo4j session
 */
export async function initializeVectorSupport(session: Session): Promise<void> {
  await ensureVectorIndexes(session);
}

/**
 * Update memory with vector embedding
 * @param session Neo4j session
 * @param memoryId Memory ID
 * @param name Memory name
 */
export async function updateMemoryEmbedding(
  session: Session,
  memoryId: string,
  name: string
): Promise<void> {
  try {
    // Calculate embedding for memory name
    const embedding = await calculateEmbedding(name);
    
    // Update memory with embedding
    await session.run(
      `MATCH (m:Memory {id: $memoryId})
       SET m.nameEmbedding = $embedding`,
      { memoryId, embedding }
    );
  } catch (error) {
    console.error(`❌ Error updating embedding for memory ${memoryId}:`, error);
    throw error;
  }
}

/**
 * Process memory for vector features
 * Adds embedding and tags
 * @param session Neo4j session
 * @param memoryId Memory ID
 * @param name Memory name (if null, will be retrieved from database)
 * @param observations Memory observations
 */
export async function processMemoryVectors(
  session: Session,
  memoryId: string,
  name?: string | null,
  observations: string[] | Array<{content: string, createdAt: string}> = []
): Promise<void> {
  if (!memoryId) {
    return;
  }
  
  // If name not provided, get it from database
  if (!name) {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId})
       RETURN m.name AS name`,
      { memoryId }
    );
    
    if (result.records.length === 0) {
      return;
    }
    
    name = result.records[0].get('name');
  }
  
  try {
    // Update embedding
    await updateMemoryEmbedding(session, memoryId, name);
    
    // Update tags
    await updateMemoryTags(session, memoryId, name, observations);
  } catch (error) {
    console.error(`❌ Error processing vectors for memory ${memoryId}:`, error);
    throw error;
  }
}

/**
 * Migrate existing memories for vector support
 * @param session Neo4j session
 * @param batchSize Number of memories per batch
 */
export async function migrateExistingMemories(
  session: Session,
  batchSize: number = 50
): Promise<{processed: number, total: number}> {
  // Count memories that need processing
  const countResult = await session.run(
    `MATCH (m:Memory)
     WHERE m.nameEmbedding IS NULL
     RETURN count(m) AS count`
  );
  
  const total = countResult.records[0].get('count').toNumber();
  
  if (total === 0) {
    return { processed: 0, total: 0 };
  }
  
  // Process in batches
  let processed = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Get batch of memories
    const batchResult = await session.run(
      `MATCH (m:Memory)
       WHERE m.nameEmbedding IS NULL
       WITH m LIMIT $batchSize
       OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
       RETURN m.id AS id, m.name AS name, collect(o.content) AS observations`,
      { batchSize }
    );
    
    // Process batch
    const memories = batchResult.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      observations: record.get('observations')
    }));
    
    if (memories.length === 0) {
      hasMore = false;
      break;
    }
    
    // Update each memory
    for (const memory of memories) {
      await processMemoryVectors(session, memory.id, memory.name, memory.observations);
      processed++;
    }
    
    // Check if more batches needed
    hasMore = memories.length === batchSize;
  }
  
  return { processed, total };
}