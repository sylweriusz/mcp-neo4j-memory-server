import { Neo4jKnowledgeGraphManager } from '../manager';

/**
 * Consolidated tool handlers for simplified schema implementation
 * No discriminated unions - just operation-based routing
 */
export class ConsolidatedToolHandlers {
  constructor(private manager: Neo4jKnowledgeGraphManager) {}

  /**
   * Memory management tool - handles create, update, delete operations
   * Updated to work with simple schema format
   */
  async handleMemoryManage(request: {
    operation: 'create' | 'update' | 'delete';
    memories?: any[];
    updates?: any[];
    identifiers?: string[];
  }): Promise<any> {
    switch (request.operation) {
      case 'create':
        if (!request.memories) {
          throw new Error("memories field required for create operation");
        }
        if (!Array.isArray(request.memories) || request.memories.length === 0) {
          throw new Error("memories array cannot be empty");
        }
        const createdMemories = await this.manager.createMemories(request.memories);
        // Strip embeddings for cleaner response
        return this.stripEmbeddings(createdMemories);

      case 'update':
        if (!request.updates) {
          throw new Error("updates field required for update operation");
        }
        const updateResults: Array<{
          id: string;
          updated: boolean;
          error?: string;
        }> = [];
        for (const update of request.updates) {
          try {
            // Update name if provided
            if (update.name !== undefined) {
              await this.manager.updateMemoryName(update.id, update.name);
            }
            
            // Update memoryType if provided
            if (update.memoryType !== undefined) {
              await this.manager.updateMemoryType(update.id, update.memoryType);
            }
            
            // Update metadata if provided
            if (update.metadata !== undefined) {
              await this.manager.updateMemoryMetadata(update.id, update.metadata);
            }
            
            updateResults.push({ id: update.id, updated: true });
          } catch (error: any) {
            // If update fails, mark as failed instead of claiming success
            updateResults.push({ 
              id: update.id, 
              updated: false, 
              error: error.message 
            });
          }
        }
        return updateResults;

      case 'delete':
        if (!request.identifiers) {
          throw new Error("identifiers field required for delete operation");
        }
        await this.manager.deleteMemories(request.identifiers);
        return { deletedCount: request.identifiers.length };

      default:
        throw new Error(`Invalid operation: ${request.operation}`);
    }
  }

  /**
   * Observation management tool - handles add, delete operations
   * Updated to work with simple schema format
   */
  async handleObservationManage(request: {
    operation: 'add' | 'delete';
    observations: Array<{
      memoryId: string;
      contents: string[];
    }>;
  }): Promise<any> {
    switch (request.operation) {
      case 'add':
        const result = await this.manager.addObservations(request.observations);
        // Return with added count for compatibility
        return result.map(obs => ({
          ...obs,
          addedCount: obs.contents ? obs.contents.length : 0
        }));

      case 'delete':
        // Convert to format expected by manager
        const deletions = request.observations.map(obs => ({
          memoryId: obs.memoryId,
          contents: obs.contents
        }));
        await this.manager.deleteObservations(deletions);
        return { message: 'Observations deleted successfully' };

      default:
        throw new Error(`Invalid operation: ${request.operation}`);
    }
  }

  /**
   * Relation management tool - handles create, delete operations
   * Updated to work with simple schema format
   */
  async handleRelationManage(request: {
    operation: 'create' | 'delete';
    relations: Array<{
      fromId: string;
      toId: string;
      relationType: string;
    }>;
  }): Promise<any> {
    switch (request.operation) {
      case 'create':
        return await this.manager.createRelations(request.relations);

      case 'delete':
        await this.manager.deleteRelations(request.relations);
        return { message: 'Relations deleted successfully' };

      default:
        throw new Error(`Invalid operation: ${request.operation}`);
    }
  }

  /**
   * Memory retrieval tool - with chronological observation sorting
   */
  async handleMemoryRetrieve(identifiers: string[]): Promise<any> {
    const graph = await this.manager.retrieveMemories(identifiers);
    
    // Sort observations chronologically (oldest to newest) for each memory
    const memoriesWithSortedObservations = graph.memories.map(memory => {
      if (memory.observations && Array.isArray(memory.observations)) {
        // Sort observations by createdAt timestamp (oldest first)
        const sortedObservations = [...memory.observations].sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB; // Ascending order (oldest to newest)
        });
        
        return {
          ...memory,
          observations: sortedObservations
        };
      }
      return memory;
    });
    
    return {
      ...graph,
      memories: this.stripEmbeddings(memoriesWithSortedObservations)
    };
  }

  /**
   * Memory search tool - with enhanced unified search providing chronological observation sorting
   */
  async handleMemorySearch(
    query: string,
    limit = 10,
    includeGraphContext = true,
    memoryTypes?: string[],
    threshold = 0.1
  ): Promise<any> {
    const results = await this.manager.searchMemories(
      query, 
      memoryTypes, 
      limit, 
      threshold, 
      includeGraphContext
    );
    
    // Enhanced search already provides properly sorted observations with timestamps
    // No additional sorting needed - just strip embeddings
    return {
      ...results,
      memories: this.stripEmbeddings(results.memories)
    };
  }

  /**
   * Database switch tool - unchanged from current implementation
   */
  async handleDatabaseSwitch(databaseName: string): Promise<any> {
    // This needs proper implementation - placeholder for now
    throw new Error('Database switch not implemented in manager');
  }

  /**
   * Helper method to strip embeddings from response
   */
  private stripEmbeddings(memories: any[]): any[] {
    if (!Array.isArray(memories)) {
      return memories;
    }
    
    return memories.map(memory => {
      if (!memory || typeof memory !== 'object') {
        return memory;
      }
      
      // Remove nameEmbedding if it exists
      const { nameEmbedding, ...rest } = memory;
      return rest;
    });
  }
}
