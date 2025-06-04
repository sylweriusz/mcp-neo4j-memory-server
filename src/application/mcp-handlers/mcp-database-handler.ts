/**
 * MCP Database Handler
 * Single responsibility: handle database-related MCP requests
 */
import { DIContainer } from '../../container/di-container';

export class McpDatabaseHandler {
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

  async handleDatabaseSwitch(databaseName: string): Promise<any> {
    await this.ensureDatabaseInitialized();
    try {
      const databaseManager = this.container.getDatabaseManager();
      return await databaseManager.switchDatabase(databaseName, true);
    } catch (error) {
      throw new Error(`Failed to switch database: ${error}`);
    }
  }
}
