/**
 * Neo4j Driver Management
 * Single responsibility: Neo4j driver lifecycle
 */

import neo4j, { Driver } from 'neo4j-driver';
import { getNeo4jConfig } from '../../config';

export class Neo4jDriverManager {
  private driver: Driver | null = null;
  private isConnected = false;
  private currentDatabase: string;

  constructor() {
    // Initialize with default database from environment
    const config = getNeo4jConfig();
    this.currentDatabase = config.database;
  }
  /**
   * Initialize driver connection
   * Lazy initialization - creates driver only when needed
   */
  getDriver(): Driver {
    if (!this.driver) {
      const config = getNeo4jConfig();
      this.driver = neo4j.driver(
        config.uri,
        neo4j.auth.basic(config.username, config.password)
      );
    }
    return this.driver;
  }

  /**
   * Verify driver connectivity
   * Returns promise that resolves when driver is ready
   */
  async verifyConnectivity(): Promise<void> {
    const driver = this.getDriver();
    const session = driver.session({ database: 'system' });
    
    try {
      await session.run('RETURN 1');
      this.isConnected = true;
    } finally {
      await session.close();
    }
  }

  /**
   * Get connection status
   */
  isDriverConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Close driver and cleanup resources
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.isConnected = false;
    }
  }

  /**
   * Get current database configuration
   */
  getCurrentDatabase(): { database: string } {
    return { database: this.currentDatabase };
  }

  /**
   * Switch to a different database
   */
  switchDatabase(databaseName: string): void {
    this.currentDatabase = databaseName;
  }
}
