/**
 * MCP Observation Handler
 * Single responsibility: handle observation-related MCP requests
 */
import { DIContainer } from '../../container/di-container';

export class McpObservationHandler {
  private container: DIContainer;

  constructor() {
    this.container = DIContainer.getInstance();
  }

  async handleObservationManage(request: {
    operation: 'add' | 'delete';
    observations: Array<{
      memoryId: string;
      contents: string[];
    }>;
  }): Promise<any> {
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
          error: error.message 
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
}
