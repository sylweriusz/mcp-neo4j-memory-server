#!/usr/bin/env node

// CRITICAL: Load environment variables FIRST, before any other imports
import { config } from "dotenv";
config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  McpMemoryHandler, 
  McpObservationHandler, 
  McpRelationHandler, 
  McpDatabaseHandler 
} from "./application/mcp-handlers";
import {
  UnifiedMemoryStoreHandler,
  UnifiedMemoryFindHandler,
  UnifiedMemoryModifyHandler
} from "./application/unified-handlers";
import { DIContainer } from "./container/di-container";
import { registerPrompts } from "./prompts";
import { registerMemoryTools, HandlerSet } from "./shared-tool-definitions";

// Create an MCP server with proper configuration
const server = new McpServer({
  name: "neo4j-memory-server", 
  version: "3.2.0" // Version from package.json
});

// Lazy handler factory - safe for tool scanning
let handlerPromise: Promise<HandlerSet> | null = null;
const getHandlers = async (): Promise<HandlerSet> => {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      // Initialize existing handlers
      const memoryHandler = new McpMemoryHandler();
      const observationHandler = new McpObservationHandler();
      const relationHandler = new McpRelationHandler();
      const databaseHandler = new McpDatabaseHandler();
      
      // Initialize unified handlers
      const unifiedStoreHandler = new UnifiedMemoryStoreHandler(memoryHandler, relationHandler);
      const unifiedFindHandler = new UnifiedMemoryFindHandler(memoryHandler);
      const unifiedModifyHandler = new UnifiedMemoryModifyHandler(
        memoryHandler, 
        observationHandler, 
        relationHandler
      );
      
      // Only initialize database if we have connection config
      const hasDbConfig = process.env.NEO4J_URI || process.env.NEO4J_USERNAME;
      if (hasDbConfig) {
        const container = DIContainer.getInstance();
        await container.initializeDatabase();
      }
      
      return { 
        databaseHandler,
        unifiedStoreHandler,
        unifiedFindHandler,
        unifiedModifyHandler
      };
    })();
  }
  return handlerPromise;
};

// =============================================================================
// UNIFIED TOOLS IMPLEMENTATION (Exactly 4 tools as specified)
// =============================================================================

// Register all memory tools using shared definitions
registerMemoryTools(server, getHandlers);

const main = async () => {
  try {
    // Register prompts first
    registerPrompts(server);
    
    const transport = new StdioServerTransport();
    await server.connect(transport);

    const cleanup = async () => {
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    
  } catch (error) {
    process.stderr.write(`[MCP Server] Failed to start: ${error}\n`);
    process.exit(1);
  }
};

main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exit(1);
});

// Export clean components for testing
export { 
  McpMemoryHandler, 
  McpObservationHandler, 
  McpRelationHandler, 
  McpDatabaseHandler,
  UnifiedMemoryStoreHandler,
  UnifiedMemoryFindHandler, 
  UnifiedMemoryModifyHandler
};
