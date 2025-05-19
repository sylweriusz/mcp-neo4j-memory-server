/**
 * Neo4j Vector Support Detection
 * Detects available vector capabilities in Neo4j deployment
 */

import { Session } from 'neo4j-driver';

export type VectorSupport = 'enterprise' | 'gds' | 'none';

// Cache for detected support level
let supportCache: VectorSupport | null = null;

/**
 * Clear support cache - testing only
 */
export function resetCache(): void {
  if (process.env.NODE_ENV === 'test') {
    supportCache = null;
  }
}

/**
 * Detect vector support capabilities
 * @param session Neo4j session
 * @returns Support level: enterprise, gds, or none
 */
export async function detectSupport(session: Session): Promise<VectorSupport> {
  if (process.env.NODE_ENV === 'test') {
    supportCache = null;
  }

  if (supportCache) {
    return supportCache;
  }

  // Test GDS first
  try {
    await session.run(`RETURN gds.similarity.cosine([0.1, 0.2], [0.2, 0.3]) AS test`);
    supportCache = 'gds';
    return 'gds';
  } catch {
    // Continue to enterprise check
  }

  // Test Enterprise
  try {
    await session.run(`
      CREATE OR REPLACE TEMP FUNCTION test_vector_support (vector1, vector2)
      RETURNS FLOAT 
      BEGIN 
        RETURN vector.similarity(vector1, vector2);
      END;
    `);
    supportCache = 'enterprise';
    return 'enterprise';
  } catch {
    supportCache = 'none';
    return 'none';
  }
}
