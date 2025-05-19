import { Neo4jKnowledgeGraphManager } from "./manager";
import { DatabaseInfo } from "./types";
import { Session } from "neo4j-driver";
import { extractError } from "./utils";
import { ensureVectorIndexes } from "./vector/support";

/**
 * Extends the Neo4jKnowledgeGraphManager with database management functionality
 * 
 * Primary responsibility:
 * - Database context switching with automatic creation
 * - Centralized management for database operations
 * 
 * Note: Index management handled through select_database tool implementation
 */
export class DatabaseManager {
  private manager: Neo4jKnowledgeGraphManager;
  
  /**
   * Constructor
   * @param manager The Neo4j knowledge graph manager to extend
   */
  constructor(manager: Neo4jKnowledgeGraphManager) {
    this.manager = manager;
  }
  
  /**
   * Get a system session (used for database operations)
   * @private
   */
  private getSystemSession(): Session {
    // Use a well-known method to get the session instead of accessing private property
    // This is better than typecasting to 'any'
    return this.manager['getSystemSession'] ? 
      (this.manager['getSystemSession']() as Session) :
      (this.manager as any).driver.session({ database: "system" });
  }
  
  /**
   * Switch to a different database with optional auto-creation
   * 
   * Core operations:
   * 1. Validate database name
   * 2. Check if database exists
   * 3. Create database if requested and needed
   * 4. Switch context to new database
   * 5. Force re-initialization of schema  
   * 
   * @param databaseName Name of the database to switch to
   * @param createIfNotExists Whether to create the database if it doesn't exist
   * @returns Information about the database operation
   */
  async switchDatabase(
    databaseName: string,
    createIfNotExists: boolean = false
  ): Promise<DatabaseInfo> {
    // Check if database name is valid
    if (!databaseName || databaseName.trim() === "") {
      throw new Error("Database name cannot be empty");
    }

    try {
      // Check if database exists
      const systemSession = this.getSystemSession();
      let databaseExists = false;

      try {
        const result = await systemSession.run(
          `SHOW DATABASES WHERE name = $databaseName`,
          { databaseName }
        );
        databaseExists = result.records.length > 0;
      } finally {
        await systemSession.close();
      }

      // Create database if it doesn't exist and we're asked to create it
      if (!databaseExists && createIfNotExists) {
        const systemSession = this.getSystemSession();
        try {
          await systemSession.run(`CREATE DATABASE $databaseName IF NOT EXISTS`, {
            databaseName,
          });
          // Database created silently to avoid log noise
        } finally {
          await systemSession.close();
        }
      } else if (!databaseExists) {
        throw new Error(`Database '${databaseName}' does not exist`);
      }

      // Access private properties through 'any' type casting
      const oldDatabase = (this.manager as any).database;
      
      // Switch the current database
      (this.manager as any).database = databaseName;
      
      // Reset initialization flag to force re-initialization with the new database
      (this.manager as any).initialized = false;
      
      // Initialize the new database by calling initialize method directly
      const initSession = this.manager.getSession();
      try {
        // Just force initialization by accessing the private initialize method
        await (this.manager as any).initialize();
      } finally {
        await initSession.close();
      }

      // Ensure vector indexes are created
      const vectorSession = this.manager.getSession();
      try {
        await ensureVectorIndexes(vectorSession);
      } finally {
        await vectorSession.close();
      }

      // FIX #1: Ensure ALL indexes including metadata fulltext index after database switch
      const indexSession = this.manager.getSession();
      try {
        // Create the metadata fulltext index specifically for the new database
        await indexSession.run(
          `CREATE FULLTEXT INDEX memory_metadata_idx IF NOT EXISTS FOR (m:Memory) ON EACH [m.metadata]`
        );
      } catch (error) {
        // Silent failure in MCP environment - log to stderr if needed
        console.error('Warning: Failed to create metadata fulltext index:', error.message);
      } finally {
        await indexSession.close();
      }

      return {
        previousDatabase: oldDatabase,
        currentDatabase: databaseName,
        created: !databaseExists && createIfNotExists,
      };
    } catch (error) {
      console.error("Error switching database", extractError(error));
      throw error;
    }
  }

  /**
   * Get current database session - needed for vector search operations
   * @returns Session for the current database
   */
  getSession(): Session {
    // Access the private getSession method of the manager
    return typeof this.manager['getSession'] === 'function' 
      ? this.manager['getSession']() 
      : (this.manager as any).driver.session({ database: (this.manager as any).database });
  }
  getCurrentDatabase(): { database: string; uri: string } {
    return {
      database: (this.manager as any).database,
      uri: (this.manager as any).neo4jConfig?.uri || "unknown",
    };
  }

  /**
   * List all available databases
   * @returns Array of database names
   */
  async listDatabases(): Promise<string[]> {
    try {
      const systemSession = this.getSystemSession();
      try {
        const result = await systemSession.run(`SHOW DATABASES`);
        return result.records
          .map((record) => record.get("name"))
          .filter((name) => name !== "system"); // Filter out system database
      } finally {
        await systemSession.close();
      }
    } catch (error) {
      console.error("Error listing databases", extractError(error));
      throw error;
    }
  }
}
