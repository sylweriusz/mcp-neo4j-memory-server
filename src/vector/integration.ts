/**
 * Vector integration with memory operations
 * Enhances core database functions with vector capabilities
 */

import { Session } from 'neo4j-driver';
import { processMemoryVectors, initializeVectorSupport } from '../vector/database';
import { EnhancedUnifiedSearch } from '../search/enhanced-unified-search';

/**
 * Hook: Process memory after creation
 * @param session Neo4j session
 * @param memory Created memory
 */
export async function afterMemoryCreate(
  session: Session,
  memory: { id: string, name: string }
): Promise<void> {
  if (!memory?.id || !memory?.name) {
    return;
  }
  
  await processMemoryVectors(session, memory.id, memory.name);
}

/**
 * Hook: Process memory after update
 * @param session Neo4j session
 * @param memory Updated memory
 * @param oldName Previous memory name
 */
export async function afterMemoryUpdate(
  session: Session,
  memory: { id: string, name: string },
  oldName: string
): Promise<void> {
  if (!memory?.id || !memory?.name) {
    return;
  }
  
  // Only update embedding if name changed
  if (memory.name !== oldName) {
    await processMemoryVectors(session, memory.id, memory.name);
  }
}

/**
 * Hook: Process memory after observation changes
 * @param session Neo4j session
 * @param memoryId Memory ID
 * @param observations Current observations
 */
export async function afterObservationChange(
  session: Session,
  memoryId: string,
  observations: string[] | Array<{content: string, createdAt: string}>
): Promise<void> {
  // Get memory name
  const result = await session.run(
    `MATCH (m:Memory {id: $memoryId})
     RETURN m.name AS name`,
    { memoryId }
  );
  
  if (result.records.length === 0) {
    return;
  }
  
  const name = result.records[0].get('name');
  await processMemoryVectors(session, memoryId, name, observations);
}

/**
 * Hook: Initialize vector support when database selected
 * @param session Neo4j session
 */
export async function afterDatabaseSelect(session: Session): Promise<void> {
  await initializeVectorSupport(session);
}

/**
 * Enhanced memory search with vectors
 * @param session Neo4j session
 * @param query Search query
 * @param limit Result limit
 */
export async function enhancedSearch(
  session: Session,
  query: string,
  limit: number = 10
): Promise<any[]> {
  if (!query || query.trim() === '') {
    return [];
  }
  
  const search = new EnhancedUnifiedSearch(session);
  return search.search(query, limit, false);
}