/**
 * Clean Database Manager
 * Single responsibility: database switching and management
 */
import { Neo4jDriverManager } from './neo4j-driver';
import { SessionFactory } from './session-factory';
import { IndexManager } from './index-manager';
import { DatabaseInfo } from '../../types';
import { MCPDatabaseError, MCPValidationError, MCPErrorCodes } from '../errors';

export class CleanDatabaseManager {
  private driverManager: Neo4jDriverManager;
  private sessionFactory: SessionFactory;

  constructor(driverManager: Neo4jDriverManager, sessionFactory: SessionFactory) {
    this.driverManager = driverManager;
    this.sessionFactory = sessionFactory;
  }

  async switchDatabase(databaseName: string): Promise<DatabaseInfo> {
    try {
      // Normalize database name to Neo4j standards
      const normalizedName = this.normalizeDatabaseName(databaseName);
      
      // Validate normalized name
      if (!this.isValidDatabaseName(normalizedName)) {
        throw new MCPValidationError(
          `Invalid database name after normalization: ${databaseName} -> ${normalizedName}`,
          MCPErrorCodes.INVALID_DATABASE_NAME
        );
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
      
      // Always create database if needed
      if (!exists) {
        await this.createDatabase(normalizedName);
      }

      // Switch database context
      this.driverManager.switchDatabase(normalizedName);

      // Initialize schema in new database
      await this.initializeDatabase();

      return {
        previousDatabase: currentDatabase,
        currentDatabase: normalizedName,
        created: !exists
      };
    } catch (error) {
      throw new MCPDatabaseError(
        `Failed to switch to database '${databaseName}': ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED,
        { databaseName, originalError: error instanceof Error ? error.message : String(error) }
      );
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
      // Database creation might not be allowed - continue anyway (silent for compatibility)
    } finally {
      await systemSession.close();
    }
  }

  private normalizeDatabaseName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new MCPValidationError(
        'Database name must be a non-empty string',
        MCPErrorCodes.INVALID_DATABASE_NAME
      );
    }
    
    // Convert to lowercase and replace spaces with hyphens
    let normalized = name.toLowerCase().replace(/\s+/g, '-');
    
    // Remove invalid characters (keep only lowercase letters, numbers, and hyphens)
    // Neo4j database names: alphanumeric characters and hyphens only
    normalized = normalized.replace(/[^a-z0-9-]/g, '');
    
    // Ensure first character is alphanumeric (remove leading hyphens)
    normalized = normalized.replace(/^-+/, '');
    if (normalized && !/^[a-z0-9]/.test(normalized)) {
      normalized = '0' + normalized;
    }
    
    // Remove trailing hyphens
    normalized = normalized.replace(/-+$/, '');
    
    // Trim to max length
    if (normalized.length > 63) {
      normalized = normalized.substring(0, 63);
    }
    
    if (!normalized) {
      throw new MCPValidationError(
        `Cannot normalize database name: ${name}`,
        MCPErrorCodes.INVALID_DATABASE_NAME
      );
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
    
    // Neo4j constraints: lowercase letters, numbers, and hyphens only
    // Must start with alphanumeric character and end with alphanumeric character
    return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name);
  }

  async close(): Promise<void> {
    await this.driverManager.close();
  }
}
