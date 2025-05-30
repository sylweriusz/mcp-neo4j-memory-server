/**
 * Test Environment Setup
 * Single responsibility: Mock dependencies for testing
 */

// Mock environment variables for tests
process.env.NEO4J_URI = 'bolt://localhost:7687';
process.env.NEO4J_USERNAME = 'neo4j';
process.env.NEO4J_PASSWORD = 'password';
process.env.NEO4J_DATABASE = 'neo4j';
process.env.LOG_LEVEL = 'error';

// Mock database driver for unit tests that don't need real Neo4j
export const mockNeo4jDriver = {
  session: () => ({
    run: () => Promise.resolve({ records: [] }),
    close: () => Promise.resolve()
  }),
  close: () => Promise.resolve()
};

// Test utilities
export function mockEmbedding(): number[] {
  return new Array(768).fill(0).map(() => Math.random());
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
