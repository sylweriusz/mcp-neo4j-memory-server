/**
 * Session Factory
 * Single responsibility: Neo4j session creation and management
 */

import { Session } from 'neo4j-driver';
import { Neo4jDriverManager } from './neo4j-driver';

export class SessionFactory {
  constructor(private driverManager: Neo4jDriverManager) {}

  /**
   * Create session for specific database
   */
  createSession(database?: string): Session {
    const driver = this.driverManager.getDriver();
    
    // Use current database from driver manager, not config
    const currentDatabase = database || this.driverManager.getCurrentDatabase().database;
    
    return driver.session({ 
      database: currentDatabase 
    });
  }

  /**
   * Create system session for database management
   */
  createSystemSession(): Session {
    const driver = this.driverManager.getDriver();
    return driver.session({ database: 'system' });
  }

  /**
   * Execute operation with session auto-cleanup
   */
  async withSession<T>(
    operation: (session: Session) => Promise<T>,
    database?: string
  ): Promise<T> {
    const session = this.createSession(database);
    try {
      return await operation(session);
    } finally {
      await session.close();
    }
  }
}
