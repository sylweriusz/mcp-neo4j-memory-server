/**
 * Lazy HTTP Handlers
 * Wrappery dla prawdziwych handlerów z lazy initialization
 * Inicjalizacja następuje dopiero przy pierwszym wywołaniu metody
 */

import { 
  McpMemoryHandler, 
  McpObservationHandler, 
  McpRelationHandler, 
  McpDatabaseHandler 
} from "../../application/mcp-handlers";
import {
  UnifiedMemoryStoreHandler,
  UnifiedMemoryFindHandler,
  UnifiedMemoryModifyHandler
} from "../../application/unified-handlers";

/**
 * Lazy wrapper dla database handler
 */
export class LazyDatabaseHandler {
  private handler?: McpDatabaseHandler;
  
  private getHandler(): McpDatabaseHandler {
    if (!this.handler) {
      this.handler = new McpDatabaseHandler();
    }
    return this.handler;
  }
  
  async handleDatabaseSwitch(databaseName: string): Promise<any> {
    return this.getHandler().handleDatabaseSwitch(databaseName);
  }
}

/**
 * Lazy wrapper dla unified store handler
 */
export class LazyUnifiedStoreHandler {
  private handler?: UnifiedMemoryStoreHandler;
  private memoryHandler?: McpMemoryHandler;
  private relationHandler?: McpRelationHandler;
  
  private getHandler(): UnifiedMemoryStoreHandler {
    if (!this.handler) {
      // Tworzymy zależności tylko gdy potrzebne
      if (!this.memoryHandler) {
        this.memoryHandler = new McpMemoryHandler();
      }
      if (!this.relationHandler) {
        this.relationHandler = new McpRelationHandler();
      }
      this.handler = new UnifiedMemoryStoreHandler(this.memoryHandler, this.relationHandler);
    }
    return this.handler;
  }
  
  async handleMemoryStore(args: any): Promise<any> {
    return this.getHandler().handleMemoryStore(args);
  }
}

/**
 * Lazy wrapper dla unified find handler
 */
export class LazyUnifiedFindHandler {
  private handler?: UnifiedMemoryFindHandler;
  private memoryHandler?: McpMemoryHandler;
  
  private getHandler(): UnifiedMemoryFindHandler {
    if (!this.handler) {
      if (!this.memoryHandler) {
        this.memoryHandler = new McpMemoryHandler();
      }
      this.handler = new UnifiedMemoryFindHandler(this.memoryHandler);
    }
    return this.handler;
  }
  
  async handleMemoryFind(args: any): Promise<any> {
    return this.getHandler().handleMemoryFind(args);
  }
}

/**
 * Lazy wrapper dla unified modify handler
 */
export class LazyUnifiedModifyHandler {
  private handler?: UnifiedMemoryModifyHandler;
  private memoryHandler?: McpMemoryHandler;
  private observationHandler?: McpObservationHandler;
  private relationHandler?: McpRelationHandler;
  
  private getHandler(): UnifiedMemoryModifyHandler {
    if (!this.handler) {
      // Tworzymy zależności tylko gdy potrzebne
      if (!this.memoryHandler) {
        this.memoryHandler = new McpMemoryHandler();
      }
      if (!this.observationHandler) {
        this.observationHandler = new McpObservationHandler();
      }
      if (!this.relationHandler) {
        this.relationHandler = new McpRelationHandler();
      }
      this.handler = new UnifiedMemoryModifyHandler(
        this.memoryHandler,
        this.observationHandler,
        this.relationHandler
      );
    }
    return this.handler;
  }
  
  async handleMemoryModify(args: any): Promise<any> {
    return this.getHandler().handleMemoryModify(args);
  }
}

/**
 * Fabryka lazy handlerów dla HTTP
 * Inicjalizacja database następuje tylko raz przy pierwszym użyciu
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
