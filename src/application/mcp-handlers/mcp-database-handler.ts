/**
 * MCP Database Handler
 * Single responsibility: handle database-related MCP requests
 */
import { DIContainer } from '../../container/di-container';

export class McpDatabaseHandler {
  private container: DIContainer;

  constructor() {
    this.container = DIContainer.getInstance();
  }

  async handleDatabaseSwitch(databaseName: string): Promise<any> {
    try {
      const databaseManager = this.container.getDatabaseManager();
      return await databaseManager.switchDatabase(databaseName, true);
    } catch (error) {
      throw new Error(`Failed to switch database: ${error}`);
    }
  }
}
