/**
 * MCP Memory Handler
 * Single responsibility: handle memory-related MCP requests using clean architecture
 */
import { DIContainer } from '../../container/di-container';
import { createErrorMessage } from '../../infrastructure/utilities';
import { MCPValidationError, MCPOperationError, MCPErrorCodes } from '../../infrastructure/errors';

export class McpMemoryHandler {
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

  async handleMemoryManage(request: {
    operation: 'create' | 'update' | 'delete';
    memories?: any[];
    updates?: any[];
    identifiers?: string[];
  }): Promise<any> {
    // Input validation - fail fast
    this.validateMemoryManageRequest(request);
    
    await this.ensureDatabaseInitialized();
    const currentDb = this.container.getCurrentDatabase();
    
    switch (request.operation) {
      case 'create':
        return this.handleCreateMemories(request.memories!, currentDb);
      case 'update':
        return this.handleUpdateMemories(request.updates!, currentDb);
      case 'delete':
        return this.handleDeleteMemories(request.identifiers!, currentDb);
      default:
        throw new MCPOperationError(
          `Invalid operation: ${request.operation}. Valid operations: create, update, delete`,
          MCPErrorCodes.VALIDATION_FAILED
        );
    }
  }

  async handleMemoryRetrieve(identifiers: string[]): Promise<any> {
    // Input validation - fail fast
    this.validateIdentifiers(identifiers);
    
    await this.ensureDatabaseInitialized();
    const currentDb = this.container.getCurrentDatabase();
    const memoryRepo = this.container.getMemoryRepository();
    
    const memories = await memoryRepo.findByIds(identifiers);
    
    return {
      memories: memories.map(memory => this.stripEmbeddings(memory)),
      _meta: {
        database: currentDb.database,
        retrieved: memories.length
      }
    };
  }

  async handleMemorySearch(
    query: string,
    limit: number,
    includeGraphContext: boolean,
    memoryTypes?: string[],
    threshold?: number
  ): Promise<any> {
    // Input validation - fail fast
    this.validateSearchRequest(query, limit, threshold);
    
    await this.ensureDatabaseInitialized();
    
    const currentDb = this.container.getCurrentDatabase();
    const searchUseCase = this.container.getSearchMemoriesUseCase();
    
    const results = await searchUseCase.execute({
      query,
      limit,
      includeGraphContext,
      memoryTypes,
      threshold
    });

    return {
      memories: results.map(result => ({
        ...this.stripEmbeddings(result.memory),
        score: result.score
      })),
      _meta: {
        database: currentDb.database,
        total: results.length,
        query: query,
        queryTime: Date.now()
      }
    };
  }

  private async handleCreateMemories(memories: any[], currentDb: any): Promise<any> {
    if (!memories || !Array.isArray(memories) || memories.length === 0) {
      throw new MCPValidationError(
        "memories array cannot be empty",
        MCPErrorCodes.EMPTY_ARRAY
      );
    }
    
    const createUseCase = this.container.getCreateMemoryUseCase();
    const results = [];
    
    for (const memoryInput of memories) {
      try {
        const memory = await createUseCase.execute(memoryInput);
        results.push({ 
          id: memory.id, 
          status: "created" 
        });
      } catch (error) {
        results.push({
          id: memoryInput.name || "unknown",
          status: "failed",
          error: createErrorMessage("Failed to create memory", error)
        });
      }
    }
    
    return {
      success: true,
      results,
      summary: {
        requested: memories.length,
        succeeded: results.filter(r => r.status === "created").length,
        failed: results.filter(r => r.status === "failed").length
      },
      _meta: {
        database: currentDb.database,
        operation: "create",
        timestamp: new Date().toISOString()
      }
    };
  }

  private async handleUpdateMemories(updates: any[], currentDb: any): Promise<any> {
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      throw new MCPValidationError(
        "updates array cannot be empty",
        MCPErrorCodes.EMPTY_ARRAY
      );
    }
    
    const updateUseCase = this.container.getUpdateMemoryUseCase();
    const results = [];
    
    for (const updateInput of updates) {
      try {
        const memory = await updateUseCase.execute(updateInput);
        results.push({ 
          id: memory.id, 
          status: "updated" 
        });
      } catch (error) {
        results.push({
          id: updateInput.id || "unknown",
          status: "failed",
          error: createErrorMessage("Failed to update memory", error)
        });
      }
    }
    
    return {
      success: true,
      results,
      summary: {
        requested: updates.length,
        succeeded: results.filter(r => r.status === "updated").length,
        failed: results.filter(r => r.status === "failed").length
      },
      _meta: {
        database: currentDb.database,
        operation: "update",
        timestamp: new Date().toISOString()
      }
    };
  }

  private async handleDeleteMemories(identifiers: string[], currentDb: any): Promise<any> {
    if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
      throw new MCPValidationError(
        "identifiers array cannot be empty",
        MCPErrorCodes.EMPTY_ARRAY
      );
    }
    
    const deleteUseCase = this.container.getDeleteMemoryUseCase();
    const results = [];
    
    for (const id of identifiers) {
      try {
        await deleteUseCase.execute(id);
        results.push({ 
          id, 
          status: "deleted" 
        });
      } catch (error) {
        results.push({ 
          id, 
          status: "failed",
          error: createErrorMessage("Failed to delete memory", error)
        });
      }
    }
    
    return {
      success: true,
      results,
      summary: {
        requested: identifiers.length,
        succeeded: results.filter(r => r.status === "deleted").length,
        failed: results.filter(r => r.status === "failed").length
      },
      _meta: {
        database: currentDb.database,
        operation: "delete",
        timestamp: new Date().toISOString()
      }
    };
  }

  private stripEmbeddings(memory: any): any {
    const { nameEmbedding, ...cleanMemory } = memory;
    return cleanMemory;
  }

  /**
   * Validate memory manage request structure
   * ZERO-FALLBACK: Invalid requests fail immediately
   */
  private validateMemoryManageRequest(request: {
    operation: 'create' | 'update' | 'delete';
    memories?: any[];
    updates?: any[];
    identifiers?: string[];
  }): void {
    if (!request.operation) {
      throw new MCPValidationError(
        'Operation is required',
        MCPErrorCodes.VALIDATION_FAILED
      );
    }

    switch (request.operation) {
      case 'create':
        if (!request.memories || !Array.isArray(request.memories) || request.memories.length === 0) {
          throw new MCPValidationError(
            'Create operation requires non-empty memories array',
            MCPErrorCodes.EMPTY_ARRAY
          );
        }
        this.validateMemoryCreationData(request.memories);
        break;
      case 'update':
        if (!request.updates || !Array.isArray(request.updates) || request.updates.length === 0) {
          throw new MCPValidationError(
            'Update operation requires non-empty updates array',
            MCPErrorCodes.EMPTY_ARRAY
          );
        }
        this.validateMemoryUpdateData(request.updates);
        break;
      case 'delete':
        if (!request.identifiers || !Array.isArray(request.identifiers) || request.identifiers.length === 0) {
          throw new MCPValidationError(
            'Delete operation requires non-empty identifiers array',
            MCPErrorCodes.EMPTY_ARRAY
          );
        }
        this.validateIdentifiers(request.identifiers);
        break;
    }
  }

  /**
   * Validate memory creation data
   */
  private validateMemoryCreationData(memories: any[]): void {
    for (let i = 0; i < memories.length; i++) {
      const memory = memories[i];
      if (!memory || typeof memory !== 'object') {
        throw new MCPValidationError(
          `Memory at index ${i} must be an object`,
          MCPErrorCodes.VALIDATION_FAILED
        );
      }
      if (!memory.name || typeof memory.name !== 'string' || memory.name.trim().length === 0) {
        throw new MCPValidationError(
          `Memory at index ${i} must have a non-empty name`,
          MCPErrorCodes.INVALID_NAME
        );
      }
      if (!memory.memoryType || typeof memory.memoryType !== 'string' || memory.memoryType.trim().length === 0) {
        throw new MCPValidationError(
          `Memory at index ${i} must have a non-empty memoryType`,
          MCPErrorCodes.INVALID_TYPE
        );
      }
    }
  }

  /**
   * Validate memory update data
   */
  private validateMemoryUpdateData(updates: any[]): void {
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update || typeof update !== 'object') {
        throw new MCPValidationError(
          `Update at index ${i} must be an object`,
          MCPErrorCodes.VALIDATION_FAILED
        );
      }
      if (!update.id || typeof update.id !== 'string' || update.id.trim().length === 0) {
        throw new MCPValidationError(
          `Update at index ${i} must have a non-empty id`,
          MCPErrorCodes.INVALID_ID_FORMAT
        );
      }
      if (update.id.length !== 18) {
        throw new MCPValidationError(
          `Update at index ${i} has invalid id format (expected 18 characters)`,
          MCPErrorCodes.INVALID_MEMORY_ID_LENGTH
        );
      }
    }
  }

  /**
   * Validate identifiers array
   */
  private validateIdentifiers(identifiers: string[]): void {
    if (!Array.isArray(identifiers)) {
      throw new MCPValidationError(
        'Identifiers must be an array',
        MCPErrorCodes.VALIDATION_FAILED
      );
    }
    if (identifiers.length === 0) {
      throw new MCPValidationError(
        'Identifiers array cannot be empty',
        MCPErrorCodes.EMPTY_ARRAY
      );
    }
    for (let i = 0; i < identifiers.length; i++) {
      const id = identifiers[i];
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new MCPValidationError(
          `Identifier at index ${i} must be a non-empty string`,
          MCPErrorCodes.INVALID_ID_FORMAT
        );
      }
      if (id.length !== 18) {
        throw new MCPValidationError(
          `Identifier at index ${i} has invalid format (expected 18 characters)`,
          MCPErrorCodes.INVALID_MEMORY_ID_LENGTH
        );
      }
    }
  }

  /**
   * Validate search request parameters
   */
  private validateSearchRequest(query: string, limit: number, threshold?: number): void {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new MCPValidationError(
        'Search query must be a non-empty string',
        MCPErrorCodes.EMPTY_QUERY
      );
    }
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new MCPValidationError(
        'Search limit must be a positive integer',
        MCPErrorCodes.INVALID_LIMIT
      );
    }
    if (limit > 1000) {
      throw new MCPValidationError(
        'Search limit cannot exceed 1000',
        MCPErrorCodes.INVALID_LIMIT
      );
    }
    if (threshold !== undefined) {
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
        throw new MCPValidationError(
          'Search threshold must be a number between 0 and 1',
          MCPErrorCodes.INVALID_THRESHOLD
        );
      }
    }
  }
}
