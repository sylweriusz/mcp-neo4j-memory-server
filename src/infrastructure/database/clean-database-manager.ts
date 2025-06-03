/**
 * Clean Database Manager
 * Single responsibility: database switching and management
 */
import { Neo4jDriverManager } from './neo4j-driver';
import { SessionFactory } from './session-factory';
import { IndexManager } from './index-manager';
import { DatabaseInfo } from '../../types';

export class CleanDatabaseManager {
  private driverManager: Neo4jDriverManager;
  private sessionFactory: SessionFactory;

  constructor(driverManager: Neo4jDriverManager, sessionFactory: SessionFactory) {
    this.driverManager = driverManager;
    this.sessionFactory = sessionFactory;
  }

  async switchDatabase(databaseName: string, createIfNotExists: boolean = true): Promise<DatabaseInfo> {
    try {
      // Validate database name
      if (!this.isValidDatabaseName(databaseName)) {
        throw new Error(`Invalid database name: ${databaseName}`);
      }

      // Get current database state
      const currentDatabase = this.driverManager.getCurrentDatabase().database;

      // GREYPLAN Optimization: If staying in same database, check schema and initialize only if needed
      if (currentDatabase === databaseName) {
        await this.ensureSchemaExists();
        return {
          previousDatabase: currentDatabase,
          currentDatabase: databaseName,
          created: false
        };
      }

      // Check if database exists
      const exists = await this.databaseExists(databaseName);
      
      // Create database if needed
      if (!exists && createIfNotExists) {
        await this.createDatabase(databaseName);
      } else if (!exists) {
        throw new Error(`Database '${databaseName}' does not exist`);
      }

      // Switch database context
      this.driverManager.switchDatabase(databaseName);

      // Initialize schema in new database
      await this.initializeDatabase();

      return {
        previousDatabase: currentDatabase,
        currentDatabase: databaseName,
        created: !exists && createIfNotExists
      };
    } catch (error) {
      throw new Error(`Failed to switch to database '${databaseName}': ${error}`);
    }
  }

  getCurrentDatabase(): { database: string } {
    return this.driverManager.getCurrentDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const userSession = this.sessionFactory.createSession();
    const indexManager = new IndexManager(userSession);
    await indexManager.initializeSchema();
    await userSession.close();
  }

  /**
   * Check if schema exists and initialize only if needed
   * GREYPLAN optimization: avoid unnecessary work
   */
  private async ensureSchemaExists(): Promise<void> {
    const userSession = this.sessionFactory.createSession();
    const indexManager = new IndexManager(userSession);
    
    try {
      const hasSchema = await indexManager.hasRequiredSchema();
      if (!hasSchema) {
        await indexManager.initializeSchema();
      }
    } finally {
      await userSession.close();
    }
  }

  private async databaseExists(databaseName: string): Promise<boolean> {
    const systemSession = this.sessionFactory.createSystemSession();
    
    try {
      const result = await systemSession.run(
        'SHOW DATABASES YIELD name WHERE name = $name',
        { name: databaseName }
      );
      return result.records.length > 0;
    } catch (error) {
      // Fallback for older Neo4j versions
      return true; // Assume it exists and let connection attempt determine
    } finally {
      await systemSession.close();
    }
  }

  private async createDatabase(databaseName: string): Promise<void> {
    const systemSession = this.sessionFactory.createSystemSession();
    
    try {
      await systemSession.run('CREATE DATABASE $name IF NOT EXISTS', { name: databaseName });
      
      // Wait a moment for database to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn(`Could not create database '${databaseName}': ${error}`);
      // Continue anyway - some Neo4j configurations don't allow database creation
    } finally {
      await systemSession.close();
    }
  }

  private isValidDatabaseName(name: string): boolean {
    // Neo4j database name constraints - production compatible
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    // Check length constraints
    if (name.length === 0 || name.length > 63) {
      return false;
    }
    
    // Neo4j constraints: lowercase letters, numbers, dots, underscores, hyphens only
    // Must start with alphanumeric character (Neo4j requirement)
    return /^[a-z0-9][a-z0-9._-]*$/.test(name);
  }

  async close(): Promise<void> {
    await this.driverManager.close();
  }
}
