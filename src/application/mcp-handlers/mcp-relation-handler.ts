/**
 * MCP Relation Handler
 * Single responsibility: handle relation-related MCP requests
 */
import { DIContainer } from '../../container/di-container';

export class McpRelationHandler {
  private container: DIContainer;

  constructor() {
    this.container = DIContainer.getInstance();
  }

  async handleRelationManage(request: {
    operation: 'create' | 'delete';
    relations: Array<{
      fromId: string;
      toId: string;
      relationType: string;
    }>;
  }): Promise<any> {
    const currentDb = this.container.getCurrentDatabase();
    const relationUseCase = this.container.getManageRelationsUseCase();

    const result = await relationUseCase.executeMany(request.operation, request.relations);

    return {
      _meta: {
        database: currentDb.database,
        processed: result.processed,
        errors: result.errors
      }
    };
  }
}
