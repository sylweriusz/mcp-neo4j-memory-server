/**
 * MCP Memory Handler
 * Single responsibility: handle memory-related MCP requests using clean architecture
 */
import { DIContainer } from '../../container/di-container';
import { createErrorMessage } from '../../infrastructure/utilities';

export class McpMemoryHandler {
  private container: DIContainer;
  private databaseInitialized = false;

  constructor() {
    this.container = DIContainer.getInstance();
  }

  private async ensureDatabaseInitialized(): Promise<void> {
    if (!this.databaseInitialized) {
      await this.container.initializeDatabase();
      this.databaseInitialized = true;
    }
  }

  async handleMemoryManage(request: {
    operation: 'create' | 'update' | 'delete';
    memories?: any[];
    updates?: any[];
    identifiers?: string[];
  }): Promise<any> {
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
        throw new Error(`Invalid operation: ${request.operation}`);
    }
  }

  async handleMemoryRetrieve(identifiers: string[]): Promise<any> {
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
    // Parameter validation performed
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
      throw new Error("memories array cannot be empty");
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
      throw new Error("updates array cannot be empty");
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
      throw new Error("identifiers array cannot be empty");
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
}
