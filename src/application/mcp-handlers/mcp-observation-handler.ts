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

    const result = await observationUseCase.executeMany(request.operation, request.observations);

    return {
      _meta: {
        database: currentDb.database,
        operation: request.operation,
        processed: result.processed,
        errors: result.errors.length
      }
    };
  }
}
