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
import { toMCPError } from "./infrastructure/errors";

// Create an MCP server with proper configuration
const server = new McpServer({
  name: "neo4j-memory-server", 
  version: "3.1.1" // Version from package.json
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

// =============================================================================
// UNIFIED TOOLS IMPLEMENTATION (Exactly 4 tools as specified)
// =============================================================================

// Tool 1: memory_store
server.tool(
  "memory_store",
  "Creates new memories with observations and establishes relationships in one atomic operation. Use 'localId' for cross-references within THIS request only. Metadata stores classification info (language, project, tags). **Always search before creating to avoid duplicates.**",
  {
    memories: z.array(z.object({
      name: z.string().describe("Human-readable memory name. Make it descriptive and searchable."),
      memoryType: z.string().describe("Memory classification (e.g., knowledge, decision, pattern, implementation, architecture)"),
      localId: z.string().optional().describe("Temporary reference ID valid ONLY within this request. Use for relations between new memories."),
      observations: z.array(z.string()).describe("Content to store. **One session = one observation per memory.** Each string becomes one observation. Don't split single thoughts into multiple strings."),
      metadata: z.record(z.any()).optional().describe("Classification data. Include: language, project, status, tags, dates, etc.")
    })).describe("Array of memories to create. Check if similar memories exist first."),
    relations: z.array(z.object({
      from: z.string().describe("Source localId or existing memoryId"),
      to: z.string().describe("Target localId or existing memoryId"),
      type: z.string().describe("Relationship type: INFLUENCES, DEPENDS_ON, EXTENDS, IMPLEMENTS, CONTAINS, etc."),
      strength: z.number().min(0.1).max(1.0).optional().describe("0.1-1.0, defaults to 0.5"),
      source: z.enum(['agent', 'user', 'system']).optional().describe("defaults to 'agent'")
    })).optional().describe("Relationships to create between memories."),
    options: z.object({
      validateReferences: z.boolean().optional().describe("Check all target IDs exist (default: true)"),
      allowDuplicateRelations: z.boolean().optional().describe("Skip/error on duplicates (default: false)"),
      transactional: z.boolean().optional().describe("All-or-nothing behavior (default: true)"),
      maxMemories: z.number().optional().describe("Batch size limit per request (default: 50)"),
      maxRelations: z.number().optional().describe("Relations limit per request (default: 200)")
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
      // MCP SDK will automatically convert this to JSON-RPC format
      throw toMCPError(error);
    }
  }
);

// Tool 2: memory_find
server.tool(
  "memory_find",
  "Finds existing memories using semantic search, IDs, or filters. Use '*' for all memories. **Search before creating new memories.** Context levels: 'minimal' for lists, 'full' for complete data, 'relations-only' for graph analysis. Updates access timestamps.",
  {
    query: z.union([z.string(), z.array(z.string())]).describe("Search query (semantic), '*' for all memories, or array of specific IDs to retrieve"),
    limit: z.number().optional().describe("Maximum results to return. Default: 10, use higher for comprehensive searches"),
    memoryTypes: z.array(z.string()).optional().describe("Filter by types (e.g., ['knowledge', 'decision']). Leave empty for all types."),
    includeContext: z.enum(["minimal", "full", "relations-only"]).optional().describe("Detail level: 'minimal' (id/name/type only), 'full' (everything), 'relations-only' (graph data)"),
    threshold: z.number().min(0.01).max(1.0).optional().describe("Minimum semantic match score (0.01-1.0). Lower = more results. Default: 0.1"),
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
      // MCP SDK will automatically convert this to JSON-RPC format
      throw toMCPError(error);
    }
  }
);

// Tool 3: memory_modify
server.tool(
  "memory_modify",
  "Modifies existing memories: update properties, manage observations, handle relationships. Use for adding new observations to existing memories. **One session = typically one observation per memory.** All operations are transactional (all-or-nothing).",
  {
    operation: z.enum([
      "update", "delete", "batch-delete",
      "add-observations", "delete-observations", 
      "create-relations", "update-relations", "delete-relations"
    ]).describe("What to do: update, delete, add-observations (common), create-relations, etc."),
    target: z.string().optional().describe("Single memory ID to modify. Use 'targets' for batch operations."),
    targets: z.array(z.string()).optional().describe("Multiple IDs for batch operations"),
    changes: z.object({
      name: z.string().optional().describe("New memory name"),
      memoryType: z.string().optional().describe("New memory type"),
      metadata: z.record(z.any()).optional().describe("New metadata (replaces existing)")
    }).optional().describe("For update operations"),
    observations: z.array(z.object({
      memoryId: z.string().describe("Target memory ID"),
      contents: z.array(z.string()).describe("For add: new observation text(s) - typically one per session. For delete: observation IDs to remove.")
    })).optional().describe("Observations to add/delete. **Add what you learned in THIS session as ONE observation per memory.**"),
    relations: z.array(z.object({
      from: z.string().describe("Source memory ID"),
      to: z.string().describe("Target memory ID"),
      type: z.string().describe("Relationship type: INFLUENCES, DEPENDS_ON, EXTENDS, IMPLEMENTS, CONTAINS, etc."),
      strength: z.number().min(0.1).max(1.0).optional().describe("For create/update operations (0.1-1.0)"),
      source: z.enum(['agent', 'user', 'system']).optional().describe("For create operations")
    })).optional().describe("Relationships to create/update/delete between existing memories."),
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
      // MCP SDK will automatically convert this to JSON-RPC format
      throw toMCPError(error);
    }
  }
);

// Tool 4: database_switch
server.tool(
  "database_switch",
  "Switches active database for ALL subsequent operations. **Use when: starting work on specific project, switching contexts, or if operations report wrong database.** Creates database if needed. This is a session-level change.",
  {
    databaseName: z.string().describe("Target database name. Will be created if it doesn't exist. All future operations use this database.")
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
      // MCP SDK will automatically convert this to JSON-RPC format
      throw toMCPError(error);
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
