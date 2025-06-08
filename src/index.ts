#!/usr/bin/env node

// CRITICAL: Load environment variables FIRST, before any other imports
import { config } from "dotenv";
config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

// Create an MCP server with proper configuration
const server = new McpServer({
  name: "neo4j-memory-server", 
  version: "3.0.2" // Version from package.json
});

// Lazy handler factory - safe for tool scanning
let handlerPromise: Promise<any> | null = null;
const getHandlers = async () => {
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

const handleToolError = (toolName: string, error: any) => {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: `${toolName} failed`,
        details: String(error)
      }, null, 2)
    }]
  };
};

// =============================================================================
// UNIFIED TOOLS IMPLEMENTATION (Exactly 4 tools as specified)
// =============================================================================

// Tool 1: memory_store
server.tool(
  "memory_store",
  "Create memories with observations and immediate relations in ONE operation. Use localId ONLY within this single request - they expire when operation completes. For existing memories, use real IDs from previous responses.",
  {
    memories: z.array(z.object({
      name: z.string().describe("Memory display name"),
      memoryType: z.string().describe("Classification type"),
      localId: z.string().optional().describe("Temporary ID for THIS request only - expires after operation"),
      observations: z.array(z.string()).describe("Initial observation content"),
      metadata: z.record(z.any()).optional().describe("Structured metadata (JSON)")
    })).describe("Memories to create"),
    relations: z.array(z.object({
      from: z.string().describe("Source localId or existing memoryId"),
      to: z.string().describe("Target localId or existing memoryId"),
      type: z.string().describe("Relationship type (INFLUENCES, DEPENDS_ON, etc.)"),
      strength: z.number().min(0.0).max(1.0).optional().describe("0.0-1.0, defaults to 0.5"),
      source: z.enum(['agent', 'user', 'system']).optional().describe("defaults to 'agent'")
    })).optional().describe("Relations to establish"),
    options: z.object({
      validateReferences: z.boolean().optional().describe("Check all target IDs exist (default: true)"),
      allowDuplicateRelations: z.boolean().optional().describe("Skip/error on duplicates (default: false)"),
      transactional: z.boolean().optional().describe("All-or-nothing behavior (default: true)"),
      maxMemories: z.number().optional().describe("Batch size limit (default: 50)"),
      maxRelations: z.number().optional().describe("Relations limit (default: 200)")
    }).optional().describe("Store options")
  },
  async (args) => {
    try {
      const { unifiedStoreHandler } = await getHandlers();
      const result = await unifiedStoreHandler.handleMemoryStore(args);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("memory_store", error);
    }
  }
);

// Tool 2: memory_find
server.tool(
  "memory_find",
  "Unified search and retrieval tool supporting semantic search, direct ID lookup, wildcard queries, date-based filtering, and graph traversal. Control response detail with context levels: 'minimal' for lists, 'full' for detailed work, 'relations-only' for graph analysis. **Searches in current database context.**",
  {
    query: z.union([z.string(), z.array(z.string())]).describe("Search query, '*' for all, or array of IDs"),
    limit: z.number().optional().describe("Max results (default: 10)"),
    memoryTypes: z.array(z.string()).optional().describe("Filter by memory types"),
    includeContext: z.enum(["minimal", "full", "relations-only"]).optional().describe("Response detail level (default: 'full')"),
    threshold: z.number().min(0.0).max(1.0).optional().describe("Min relevance score 0.0-1.0 (default: 0.1)"),
    orderBy: z.enum(["relevance", "created", "modified", "accessed"]).optional().describe("Sort order (default: 'relevance')"),
    
    // Date-based filtering
    createdAfter: z.string().optional().describe("ISO date or relative ('7d', '30d', '3m', '1y')"),
    createdBefore: z.string().optional().describe("ISO date or relative"),
    modifiedSince: z.string().optional().describe("ISO date or relative"),
    accessedSince: z.string().optional().describe("ISO date or relative"),
    
    // Graph traversal
    traverseFrom: z.string().optional().describe("Starting memory ID for graph traversal"),
    traverseRelations: z.array(z.string()).optional().describe("Relation types to follow ['INFLUENCES', 'DEPENDS_ON']"),
    maxDepth: z.number().min(1).max(5).optional().describe("Maximum traversal depth (1-5, default: 2)"),
    traverseDirection: z.enum(["outbound", "inbound", "both"]).optional().describe("Traversal direction (default: 'both')")
  },
  async (args) => {
    try {
      const { unifiedFindHandler } = await getHandlers();
      const result = await unifiedFindHandler.handleMemoryFind(args);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("memory_find", error);
    }
  }
);

// Tool 3: memory_modify
server.tool(
  "memory_modify",
  "Comprehensive modification tool for existing memories. Handle memory property updates, deletions, observation management, and relationship operations. Supports both single and batch operations with transactional safety. **Modifies memories in current database context.**",
  {
    operation: z.enum([
      "update", "delete", "batch-delete",
      "add-observations", "delete-observations", 
      "create-relations", "update-relations", "delete-relations"
    ]).describe("Operation type"),
    target: z.string().optional().describe("Memory ID for single operations"),
    targets: z.array(z.string()).optional().describe("Multiple IDs for batch operations"),
    changes: z.object({
      name: z.string().optional().describe("New memory name"),
      memoryType: z.string().optional().describe("New memory type"),
      metadata: z.record(z.any()).optional().describe("New metadata (replaces existing)")
    }).optional().describe("For update operations"),
    observations: z.array(z.object({
      memoryId: z.string().describe("Target memory ID"),
      contents: z.array(z.string()).describe("Observation texts (add) or IDs (delete)")
    })).optional().describe("For observation operations"),
    relations: z.array(z.object({
      from: z.string().describe("Source memory ID"),
      to: z.string().describe("Target memory ID"),
      type: z.string().describe("Relation type"),
      strength: z.number().min(0.0).max(1.0).optional().describe("For create/update operations (0.0-1.0)"),
      source: z.enum(['agent', 'user', 'system']).optional().describe("For create operations")
    })).optional().describe("For relation operations"),
    options: z.object({
      cascadeDelete: z.boolean().optional().describe("Delete related observations/relations (default: true)"),
      validateObservationIds: z.boolean().optional().describe("Validate observation IDs for delete (default: true)"),
      createIfNotExists: z.boolean().optional().describe("For database operations")
    }).optional().describe("Modify options")
  },
  async (args) => {
    try {
      const { unifiedModifyHandler } = await getHandlers();
      const result = await unifiedModifyHandler.handleMemoryModify(args);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("memory_modify", error);
    }
  }
);

// Tool 4: database_switch
server.tool(
  "database_switch",
  "Switches to different database context for all subsequent operations. Global state change - all memory operations after this call will execute in the specified database. Always creates database if it doesn't exist.",
  {
    databaseName: z.string().describe("Database name to switch to")
  },
  async (args) => {
    try {
      const { databaseHandler } = await getHandlers();
      const result = await databaseHandler.handleDatabaseSwitch(args.databaseName);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("database_switch", error);
    }
  }
);

const main = async () => {
  try {
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
