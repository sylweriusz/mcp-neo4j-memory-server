/**
 * MCP Database Handler
 * Single responsibility: handle database-related MCP requests
 * FIXED: Race condition protection and proper validation
 */
import { DIContainer } from '../../container/di-container';
import { MCPDatabaseError, MCPValidationError, MCPErrorCodes } from '../../infrastructure/errors';

export class McpDatabaseHandler {
  private container: DIContainer;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.container = DIContainer.getInstance();
  }

  /**
   * ZERO-FALLBACK: Thread-safe database initialization
   * Uses Promise-based singleton pattern to prevent race conditions
   */
  private async ensureDatabaseInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.container.initializeDatabase()
        .catch((error) => {
          // Reset promise on failure to allow retry
          this.initializationPromise = null;
          throw error;
        });
    }
    return this.initializationPromise;
  }

  /**
   * Handle database switch with validation and proper error handling
   */
  async handleDatabaseSwitch(databaseName: string): Promise<any> {
    // Input validation - fail fast
    this.validateDatabaseName(databaseName);
    
    await this.ensureDatabaseInitialized();
    
    try {
      const databaseManager = this.container.getDatabaseManager();
      return await databaseManager.switchDatabase(databaseName);
    } catch (error) {
      // Specific error types based on actual failure
      if (error instanceof Error) {
        if (error.message.includes('Invalid database name')) {
          throw new MCPValidationError(
            `Invalid database name: ${databaseName}`,
            MCPErrorCodes.INVALID_DATABASE_NAME,
            { databaseName, reason: 'invalid_name' }
          );
        }
        
        if (error.message.includes('Connection failed') || 
            error.message.includes('ServiceUnavailable')) {
          throw new MCPDatabaseError(
            `Database connection failed: ${error.message}`,
            MCPErrorCodes.DATABASE_UNAVAILABLE
          );
        }
      }
      
      // Fallback for unknown errors
      throw new MCPDatabaseError(
        `Database switch to '${databaseName}' failed: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED
      );
    }
  }

  /**
   * Validate database name according to Neo4j constraints
   * ZERO-FALLBACK: Invalid names throw immediately
   */
  private validateDatabaseName(databaseName: string): void {
    if (!databaseName || typeof databaseName !== 'string') {
      throw new MCPValidationError(
        'Database name must be a non-empty string',
        MCPErrorCodes.INVALID_DATABASE_NAME
      );
    }

    if (databaseName.trim() !== databaseName) {
      throw new MCPValidationError(
        'Database name cannot have leading or trailing whitespace',
        MCPErrorCodes.INVALID_DATABASE_NAME
      );
    }

    if (databaseName.length === 0) {
      throw new MCPValidationError(
        'Database name cannot be empty',
        MCPErrorCodes.INVALID_DATABASE_NAME
      );
    }

    if (databaseName.length > 63) {
      throw new MCPValidationError(
        'Database name cannot exceed 63 characters',
        MCPErrorCodes.INVALID_DATABASE_NAME,
        { length: databaseName.length, maxLength: 63 }
      );
    }

    // Neo4j database name constraints (before normalization)
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(databaseName)) {
      throw new MCPValidationError(
        'Database name contains invalid characters. Only letters, numbers, spaces, hyphens, and underscores are allowed',
        MCPErrorCodes.INVALID_DATABASE_NAME,
        { invalidName: databaseName }
      );
    }
  }
}
