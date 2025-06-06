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
      // Normalize database name to Neo4j standards
      const normalizedName = this.normalizeDatabaseName(databaseName);
      
      // Validate normalized name
      if (!this.isValidDatabaseName(normalizedName)) {
        throw new Error(`Invalid database name after normalization: ${databaseName} -> ${normalizedName}`);
      }

      // Get current database state
      const currentDatabase = this.driverManager.getCurrentDatabase().database;

      // GREYPLAN Optimization: If staying in same database, check schema and initialize only if needed
      if (currentDatabase === normalizedName) {
        await this.ensureSchemaExists();
        return {
          previousDatabase: currentDatabase,
          currentDatabase: normalizedName,
          created: false
        };
      }

      // Check if database exists
      const exists = await this.databaseExists(normalizedName);
      
      // Create database if needed
      if (!exists && createIfNotExists) {
        await this.createDatabase(normalizedName);
      } else if (!exists) {
        throw new Error(`Database '${normalizedName}' does not exist`);
      }

      // Switch database context
      this.driverManager.switchDatabase(normalizedName);

      // Initialize schema in new database
      await this.initializeDatabase();

      return {
        previousDatabase: currentDatabase,
        currentDatabase: normalizedName,
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
    // Pass undefined dimensions - vector indexes will be skipped
    const indexManager = new IndexManager(userSession, undefined);
    await indexManager.initializeSchema();
    await userSession.close();
  }

  /**
   * Check if schema exists and initialize only if needed
   * GREYPLAN optimization: avoid unnecessary work
   */
  private async ensureSchemaExists(): Promise<void> {
    const userSession = this.sessionFactory.createSession();
    // Pass undefined dimensions - vector indexes will be skipped
    const indexManager = new IndexManager(userSession, undefined);
    
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

  private normalizeDatabaseName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new Error('Database name must be a non-empty string');
    }
    
    // Convert to lowercase and replace spaces with hyphens
    let normalized = name.toLowerCase().replace(/\s+/g, '-');
    
    // Remove invalid characters (keep only lowercase letters, numbers, dots, underscores, hyphens)
    normalized = normalized.replace(/[^a-z0-9._-]/g, '');
    
    // Ensure first character is alphanumeric
    if (normalized && !/^[a-z0-9]/.test(normalized)) {
      normalized = '0' + normalized;
    }
    
    // Trim to max length
    if (normalized.length > 63) {
      normalized = normalized.substring(0, 63);
    }
    
    if (!normalized) {
      throw new Error(`Cannot normalize database name: ${name}`);
    }
    
    return normalized;
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
