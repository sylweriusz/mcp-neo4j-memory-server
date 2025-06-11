/**
 * Lazy HTTP Handlers
 * Wrappery dla prawdziwych handlerów z lazy initialization
 * Używa dynamicznych importów aby uniknąć inicjalizacji podczas ładowania modułu
 */

/**
 * Lazy wrapper dla database handler
 */
export class LazyDatabaseHandler {
  private handler?: any;
  
  private async getHandler(): Promise<any> {
    if (!this.handler) {
      // Dynamiczny import - tylko gdy potrzebny
      const { McpDatabaseHandler } = await import("../../application/mcp-handlers");
      this.handler = new McpDatabaseHandler();
    }
    return this.handler;
  }
  
  async handleDatabaseSwitch(databaseName: string): Promise<any> {
    const handler = await this.getHandler();
    return handler.handleDatabaseSwitch(databaseName);
  }
}

/**
 * Lazy wrapper dla unified store handler
 */
export class LazyUnifiedStoreHandler {
  private handler?: any;
  
  private async getHandler(): Promise<any> {
    if (!this.handler) {
      // Dynamiczne importy - tylko gdy potrzebne
      const [
        { McpMemoryHandler, McpRelationHandler },
        { UnifiedMemoryStoreHandler }
      ] = await Promise.all([
        import("../../application/mcp-handlers"),
        import("../../application/unified-handlers")
      ]);
      
      const memoryHandler = new McpMemoryHandler();
      const relationHandler = new McpRelationHandler();
      this.handler = new UnifiedMemoryStoreHandler(memoryHandler, relationHandler);
    }
    return this.handler;
  }
  
  async handleMemoryStore(args: any): Promise<any> {
    const handler = await this.getHandler();
    return handler.handleMemoryStore(args);
  }
}

/**
 * Lazy wrapper dla unified find handler
 */
export class LazyUnifiedFindHandler {
  private handler?: any;
  
  private async getHandler(): Promise<any> {
    if (!this.handler) {
      // Dynamiczne importy
      const [
        { McpMemoryHandler },
        { UnifiedMemoryFindHandler }
      ] = await Promise.all([
        import("../../application/mcp-handlers"),
        import("../../application/unified-handlers")
      ]);
      
      const memoryHandler = new McpMemoryHandler();
      this.handler = new UnifiedMemoryFindHandler(memoryHandler);
    }
    return this.handler;
  }
  
  async handleMemoryFind(args: any): Promise<any> {
    const handler = await this.getHandler();
    return handler.handleMemoryFind(args);
  }
}

/**
 * Lazy wrapper dla unified modify handler
 */
export class LazyUnifiedModifyHandler {
  private handler?: any;
  
  private async getHandler(): Promise<any> {
    if (!this.handler) {
      // Dynamiczne importy
      const [
        { McpMemoryHandler, McpObservationHandler, McpRelationHandler },
        { UnifiedMemoryModifyHandler }
      ] = await Promise.all([
        import("../../application/mcp-handlers"),
        import("../../application/unified-handlers")
      ]);
      
      const memoryHandler = new McpMemoryHandler();
      const observationHandler = new McpObservationHandler();
      const relationHandler = new McpRelationHandler();
      
      this.handler = new UnifiedMemoryModifyHandler(
        memoryHandler,
        observationHandler,
        relationHandler
      );
    }
    return this.handler;
  }
  
  async handleMemoryModify(args: any): Promise<any> {
    const handler = await this.getHandler();
    return handler.handleMemoryModify(args);
  }
}

/**
 * Fabryka lazy handlerów dla HTTP
 * Zwraca natychmiast bez żadnych importów czy inicjalizacji
 */
export async function createLazyHandlers() {
  // Zwracamy natychmiast - bez żadnej inicjalizacji
  return {
    databaseHandler: new LazyDatabaseHandler(),
    unifiedStoreHandler: new LazyUnifiedStoreHandler(),
    unifiedFindHandler: new LazyUnifiedFindHandler(),
    unifiedModifyHandler: new LazyUnifiedModifyHandler()
  };
}
