/**
 * MCP Relation Handler
 * Single responsibility: handle relation-related MCP requests
 */
import { DIContainer } from '../../container/di-container';
import { getErrorMessage } from '../../infrastructure/utilities';

export class McpRelationHandler {
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

  async handleRelationManage(request: {
    operation: 'create' | 'delete';
    relations: Array<{
      fromId: string;
      toId: string;
      relationType: string;
      strength?: number;
      source?: 'agent' | 'user' | 'system';
    }>;
  }): Promise<any> {
    await this.ensureDatabaseInitialized();
    const currentDb = this.container.getCurrentDatabase();
    const relationUseCase = this.container.getManageRelationsUseCase();

    const results = [];
    
    for (const relation of request.relations) {
      try {
        if (request.operation === 'create') {
          await relationUseCase.createRelation(relation);
        } else {
          await relationUseCase.deleteRelation(relation);
        }
        
        results.push({ 
          fromId: relation.fromId, 
          toId: relation.toId, 
          relationType: relation.relationType,
          status: request.operation === 'create' ? "created" : "deleted"
        });
      } catch (error) {
        results.push({ 
          fromId: relation.fromId, 
          toId: relation.toId, 
          relationType: relation.relationType,
          status: "failed", 
          error: getErrorMessage(error)
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        requested: request.relations.length,
        succeeded: results.filter(r => r.status === "created" || r.status === "deleted").length,
        failed: results.filter(r => r.status === "failed").length
      },
      _meta: {
        database: currentDb.database,
        operation: request.operation,
        timestamp: new Date().toISOString()
      }
    };
  }
}
