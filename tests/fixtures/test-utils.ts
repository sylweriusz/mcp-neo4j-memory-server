/**
 * Test Configuration and Utilities
 * Single responsibility: Test setup and common testing utilities
 */

export const TEST_CONFIG = {
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: 'neo4j' // Use default database for tests
  },
  test: {
    timeout: 30000, // 30 seconds for database operations
    maxRetries: 3,
    cleanupRetryDelay: 1000
  }
};

/**
 * Generate test memory data for consistent testing
 */
export function createTestMemory(overrides: Partial<any> = {}): any {
  return {
    name: 'Test Memory',
    memoryType: 'project',
    metadata: { test: true },
    observations: ['Test observation'],
    tags: ['test'],
    ...overrides
  };
}

/**
 * Sleep utility for tests that need timing
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry utility for flaky database operations
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(delay);
    }
  }
  throw new Error('Retry failed');
}
