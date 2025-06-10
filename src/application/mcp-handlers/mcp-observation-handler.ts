/**
 * MCP Observation Handler
 * Single responsibility: handle observation-related MCP requests
 */
import { DIContainer } from '../../container/di-container';
import { getErrorMessage } from '../../infrastructure/utilities';
import { MCPValidationError, MCPErrorCodes } from '../../infrastructure/errors';

export class McpObservationHandler {
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

  async handleObservationManage(request: {
    operation: 'add' | 'delete';
    observations: Array<{
      memoryId: string;
      contents: string[];
    }>;
  }): Promise<any> {
    // Input validation - fail fast
    this.validateObservationRequest(request);
    
    await this.ensureDatabaseInitialized();
    const currentDb = this.container.getCurrentDatabase();
    const observationUseCase = this.container.getManageObservationsUseCase();

    const results = [];
    let totalObservationsProcessed = 0;
    
    for (const obsRequest of request.observations) {
      try {
        // Execute the operation for this memory
        const result = await observationUseCase.executeMany(request.operation, [obsRequest]);
        
        // THE VETERAN'S FIX: Actually check if the operation succeeded
        if (result.errors.length === 0) {
          results.push({ 
            memoryId: obsRequest.memoryId, 
            status: "success",
            observations: {
              requested: obsRequest.contents.length,
              processed: obsRequest.contents.length  // FIXED: Report actual observations processed, not groups
            }
          });
          totalObservationsProcessed += obsRequest.contents.length;  // FIXED: Count actual observations, not groups
        } else {
          results.push({ 
            memoryId: obsRequest.memoryId, 
            status: "failed", 
            error: result.errors.join('; ')  // Report the actual errors
          });
        }
      } catch (error) {
        results.push({ 
          memoryId: obsRequest.memoryId, 
          status: "failed", 
          error: getErrorMessage(error)
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        memories_processed: results.filter(r => r.status === "success").length,
        memories_failed: results.filter(r => r.status === "failed").length,
        observations_processed: totalObservationsProcessed
      },
      _meta: {
        database: currentDb.database,
        operation: request.operation,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Validate observation management request
   * ZERO-FALLBACK: Invalid requests fail immediately
   */
  private validateObservationRequest(request: {
    operation: 'add' | 'delete';
    observations: Array<{
      memoryId: string;
      contents: string[];
    }>;
  }): void {
    if (!request.operation) {
      throw new MCPValidationError(
        'Operation is required',
        MCPErrorCodes.VALIDATION_FAILED
      );
    }

    if (!['add', 'delete'].includes(request.operation)) {
      throw new MCPValidationError(
        `Invalid operation: ${request.operation}. Valid operations: add, delete`,
        MCPErrorCodes.VALIDATION_FAILED
      );
    }

    if (!request.observations || !Array.isArray(request.observations) || request.observations.length === 0) {
      throw new MCPValidationError(
        'Observations array is required and cannot be empty',
        MCPErrorCodes.EMPTY_ARRAY
      );
    }

    for (let i = 0; i < request.observations.length; i++) {
      const obs = request.observations[i];
      if (!obs || typeof obs !== 'object') {
        throw new MCPValidationError(
          `Observation at index ${i} must be an object`,
          MCPErrorCodes.VALIDATION_FAILED
        );
      }
      if (!obs.memoryId || typeof obs.memoryId !== 'string' || obs.memoryId.trim().length === 0) {
        throw new MCPValidationError(
          `Observation at index ${i} must have a non-empty memoryId`,
          MCPErrorCodes.INVALID_ID_FORMAT
        );
      }
      if (obs.memoryId.length !== 18) {
        throw new MCPValidationError(
          `Observation at index ${i} has invalid memoryId format (expected 18 characters)`,
          MCPErrorCodes.INVALID_MEMORY_ID_LENGTH
        );
      }
      if (!obs.contents || !Array.isArray(obs.contents) || obs.contents.length === 0) {
        throw new MCPValidationError(
          `Observation at index ${i} must have a non-empty contents array`,
          MCPErrorCodes.EMPTY_ARRAY
        );
      }
      
      // Validate contents based on operation
      if (request.operation === 'add') {
        this.validateObservationContentsForAdd(obs.contents, i);
      } else if (request.operation === 'delete') {
        this.validateObservationContentsForDelete(obs.contents, i);
      }
    }
  }

  /**
   * Validate observation contents for add operation (must be strings)
   */
  private validateObservationContentsForAdd(contents: string[], observationIndex: number): void {
    for (let j = 0; j < contents.length; j++) {
      const content = contents[j];
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new MCPValidationError(
          `Observation at index ${observationIndex}, content at index ${j} must be a non-empty string`,
          MCPErrorCodes.INVALID_OBSERVATION_CONTENT
        );
      }
    }
  }

  /**
   * Validate observation contents for delete operation (must be observation IDs)
   */
  private validateObservationContentsForDelete(contents: string[], observationIndex: number): void {
    for (let j = 0; j < contents.length; j++) {
      const id = contents[j];
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new MCPValidationError(
          `Observation at index ${observationIndex}, ID at index ${j} must be a non-empty string`,
          MCPErrorCodes.INVALID_ID_FORMAT
        );
      }
      if (id.length !== 18) {
        throw new MCPValidationError(
          `Observation at index ${observationIndex}, ID at index ${j} has invalid format (expected 18 characters)`,
          MCPErrorCodes.INVALID_MEMORY_ID_LENGTH
        );
      }
    }
  }
}
