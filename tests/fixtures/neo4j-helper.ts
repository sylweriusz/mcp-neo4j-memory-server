/**
 * Integration Test Helper
 * Checks if Neo4j is available for integration tests
 */

export async function isNeo4jAvailable(): Promise<boolean> {
  try {
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.default.auth.basic(
        process.env.NEO4J_USERNAME || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      )
    );
    
    const session = driver.session();
    await session.run('RETURN 1');
    await session.close();
    await driver.close();
    
    return true;
  } catch (error) {
    console.warn('Neo4j not available for integration tests:', error.message);
    return false;
  }
}

export function skipIfNoNeo4j(testFn: () => void): void {
  beforeEach(async () => {
    const available = await isNeo4jAvailable();
    if (!available) {
      console.log('Skipping test - Neo4j not available');
      return;
    }
  });
  
  testFn();
}
