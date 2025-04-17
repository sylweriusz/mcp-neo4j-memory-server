import { Neo4jKnowledgeGraphManager } from "./manager";
import { DatabaseInfo } from "./types";
import { Session } from "neo4j-driver";
import { extractError } from "./utils";

/**
 * Extends the Neo4jKnowledgeGraphManager with database switching functionality
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
   * Switch to a different database
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
          // Use this.manager's logger instead of console.log to avoid JSON parsing issues
          if (this.manager['logger'] && this.manager['logger'].info) {
            this.manager['logger'].info(`Created new database: ${databaseName}`);
          }
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
      
      // Initialize the new database by calling a public method
      await this.manager.createEntities([]);

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
   * Get current database information
   * @returns Information about the current database
   */
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
