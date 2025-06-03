/**
 * Observation Repository - Specialized Domain Extract
 * THE IMPLEMENTOR'S RULE: Observations have their own lifecycle, separate from Memory CRUD
 * Single responsibility: Observation persistence and management
 */

import { Session } from 'neo4j-driver';
import { generateCompactId } from '../../../id_generator';
import { calculateEmbedding } from '../../utilities';

export interface ObservationData {
  id: string;
  content: string;
  createdAt: string;
}

export class ObservationRepository {

  /**
   * Create observations for a memory (batch operation)
   */
  async createObservations(session: Session, memoryId: string, contents: string[]): Promise<void> {
    for (const content of contents) {
      await this.createSingleObservation(session, memoryId, content);
    }
  }

  /**
   * Create single observation with embedding calculation
   */
  private async createSingleObservation(session: Session, memoryId: string, content: string): Promise<void> {
    // THE VETERAN'S PARANOIA: Someone is passing objects instead of strings
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Observation content must be a non-empty string');
    }
    
    const obsId = generateCompactId();
    // ZERO-FALLBACK ARCHITECTURE: Embedding calculation must succeed or operation fails
    const embedding = await calculateEmbedding(content);

    await session.run(`
      MATCH (m:Memory {id: $memoryId})
      CREATE (o:Observation {
        id: $obsId,
        content: $content,
        createdAt: $timestamp,
        embedding: $embedding
      })
      CREATE (m)-[:HAS_OBSERVATION]->(o)`,
      { 
        memoryId, 
        obsId, 
        content, 
        timestamp: new Date().toISOString(),
        embedding
      }
    );
  }

  /**
   * Delete observations by IDs
   */
  async deleteObservations(session: Session, memoryId: string, observationIds: string[]): Promise<void> {
    await session.run(`
      MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
      WHERE o.id IN $observationIds
      DETACH DELETE o`,
      { memoryId, observationIds }
    );
  }

  /**
   * Get observations for memory with chronological ordering
   */
  async getObservationsForMemory(session: Session, memoryId: string): Promise<ObservationData[]> {
    const cypher = `
      MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
      RETURN o.id as id, o.content as content, o.createdAt as createdAt
      ORDER BY o.createdAt ASC
    `;

    const result = await session.run(cypher, { memoryId });
    
    return result.records.map(record => ({
      id: record.get('id'),
      content: record.get('content'),
      createdAt: record.get('createdAt')
    }));
  }

  /**
   * Get observations for multiple memories (batch operation)
   */
  async getBatchObservations(session: Session, memoryIds: string[]): Promise<Map<string, ObservationData[]>> {
    if (memoryIds.length === 0) {
      return new Map();
    }

    const cypher = `
      MATCH (m:Memory)-[:HAS_OBSERVATION]->(o:Observation)
      WHERE m.id IN $memoryIds
      WITH m, o ORDER BY o.createdAt ASC
      RETURN m.id as memoryId, 
             collect({
               id: o.id, 
               content: o.content, 
               createdAt: o.createdAt
             }) as observations
    `;

    const result = await session.run(cypher, { memoryIds });
    
    const observationsMap = new Map<string, ObservationData[]>();
    
    for (const record of result.records) {
      const memoryId = record.get('memoryId');
      const observations = record.get('observations') || [];
      
      observationsMap.set(memoryId, observations
        .filter((obs: any) => obs.content)
        .map((obs: any) => ({
          id: obs.id,
          content: obs.content,
          createdAt: obs.createdAt
        }))
      );
    }

    return observationsMap;
  }
}
