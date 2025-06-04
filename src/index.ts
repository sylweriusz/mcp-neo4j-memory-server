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
import { DIContainer } from "./container/di-container";
import { MemoryObject } from "./types";

// Create an MCP server with proper configuration
const server = new McpServer({
  name: "neo4j-memory-server",
  version: "2.3.1"  // GDD v2.3.1: Reality-based index cleanup + comprehensive audit compliance
});

// Ultra-lazy initialization - zero blocking operations during tool registration
let memoryHandler: McpMemoryHandler | null = null;
let observationHandler: McpObservationHandler | null = null;
let relationHandler: McpRelationHandler | null = null;
let databaseHandler: McpDatabaseHandler | null = null;
let initializationPromise: Promise<void> | null = null;

const ensureHandlersInitialized = async () => {
  if (memoryHandler && observationHandler && relationHandler && databaseHandler) {
    return { memoryHandler, observationHandler, relationHandler, databaseHandler };
  }

  if (!initializationPromise) {
    initializationPromise = initializeHandlers();
  }
  
  await initializationPromise;
  
  // TypeScript assertion: after initializeHandlers completes, all handlers are guaranteed non-null
  if (!memoryHandler || !observationHandler || !relationHandler || !databaseHandler) {
    throw new Error("Handler initialization failed - internal error");
  }
  
  return { memoryHandler, observationHandler, relationHandler, databaseHandler };
};

const initializeHandlers = async () => {
  try {
    memoryHandler = new McpMemoryHandler();
    observationHandler = new McpObservationHandler();
    relationHandler = new McpRelationHandler();
    databaseHandler = new McpDatabaseHandler();
    
    // Database initialization happens only on first actual tool call
    const container = DIContainer.getInstance();
    await container.initializeDatabase();
  } catch (error) {
    console.error("[MCP Server] Failed to initialize handlers:", error);
    // Reset for retry
    memoryHandler = null;
    observationHandler = null;
    relationHandler = null;
    databaseHandler = null;
    initializationPromise = null;
    throw error;
  }
};

// Tool 1: Memory Management 
server.tool(
  "memory_manage",
  "Creates, updates, or deletes memories. Use 'create' for new memories that don't exist. Metadata = classification, observations = content. Include language in metadata.",
  {
    operation: z.enum(['create', 'update', 'delete']).describe("Operation type"),
    memories: z.array(MemoryObject).optional().describe("Memories to create"),
    updates: z.array(z.object({
      id: z.string().describe("Memory ID"),
      name: z.string().optional().describe("New name"),
      memoryType: z.string().optional().describe("New type"),
      metadata: z.record(z.any()).optional().describe("New metadata")
    })).optional().describe("Memories to update"),
    identifiers: z.array(z.string()).optional().describe("Memory IDs to delete")
  },
  async ({ operation, memories, updates, identifiers }) => {
    try {
      const { memoryHandler } = await ensureHandlersInitialized();
      const result = await memoryHandler.handleMemoryManage({ operation, memories, updates, identifiers });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            { error: "Error managing memories", details: String(error) },
            null, 2
          ),
        }],
      };
    }
  }
);

// Tool 2: Memory Retrieval
server.tool(
  "memory_retrieve",
  "Retrieves memories by specific IDs. Updates access timestamps and returns relations between memories.",
  {
    identifiers: z.array(z.string()).describe("Memory IDs to retrieve"),
  },
  async ({ identifiers }) => {
    try {
      const { memoryHandler } = await ensureHandlersInitialized();
      const result = await memoryHandler.handleMemoryRetrieve(identifiers);
      return {
        content: [{
          type: "text", 
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            { error: "Error retrieving memories", details: String(error) },
            null, 2
          ),
        }],
      };
    }
  }
);

// Tool 3: Memory Search
server.tool(
  "memory_search",
  "Finds existing memories using semantic search. Use '*' for all memories. Search before creating new memories.",
  {
    query: z.string().describe("Search query or '*' for all"),
    limit: z.number().optional().describe("Max results (default: 10)"),
    includeGraphContext: z.boolean().optional().describe("Include relations (default: true)"),
    memoryTypes: z.array(z.string()).optional().describe("Filter by types"),
    threshold: z.number().optional().describe("Min score 0.0-1.0 (default: 0.1)"),
  },
  async ({ query, limit = 10, includeGraphContext = true, memoryTypes, threshold = 0.1 }) => {
    try {
      const { memoryHandler } = await ensureHandlersInitialized();
      const result = await memoryHandler.handleMemorySearch(
        query, 
        limit,
        includeGraphContext, 
        memoryTypes, 
        threshold
      );
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            { error: "Error searching memories", details: String(error) },
            null, 2
          ),
        }],
      };
    }
  }
);

// Tool 4: Observation Management
server.tool(
  "observation_manage",
  "Adds or deletes observations from existing memories. Use for adding to existing memories. One session = one observation. Add what you learned now.",
  {
    operation: z.enum(['add', 'delete']).describe("Operation type"),
    observations: z.array(z.object({
      memoryId: z.string().describe("Memory ID"),
      contents: z.array(z.string()).describe("Observation texts (add) or IDs (delete)")
    })).describe("Observations to manage")
  },
  async ({ operation, observations }) => {
    try {
      const { observationHandler } = await ensureHandlersInitialized();
      if (!observationHandler) {
        throw new Error("Observation handler not initialized");
      }
      const result = await observationHandler.handleObservationManage({ operation, observations });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            { 
              error: "Error managing observations", 
              details: String(error)
            },
            null, 2
          ),
        }],
      };
    }
  }
);

// Tool 5: Relation Management
server.tool(
  "relation_manage", 
  "Creates or deletes relationships between memories. Relations = connections between memories.",
  {
    operation: z.enum(['create', 'delete']).describe("Operation type"),
    relations: z.array(z.object({
      fromId: z.string().describe("Source memory ID"),
      toId: z.string().describe("Target memory ID"),
      relationType: z.string().describe("Relation type (e.g., INFLUENCES, DEPENDS_ON, CONTAINS)"),
      strength: z.number().min(0.0).max(1.0).optional().describe("Strength 0.0-1.0 (default: 0.5)"),
      source: z.enum(['agent', 'user', 'system']).optional().describe("Origin (default: agent)")
    })).describe("Relations to manage")
  },
  async ({ operation, relations }) => {
    try {
      const { relationHandler } = await ensureHandlersInitialized();
      if (!relationHandler) {
        throw new Error("Relation handler not initialized");
      }
      const result = await relationHandler.handleRelationManage({ operation, relations });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            { error: "Error managing relations", details: String(error) },
            null, 2
          ),
        }],
      };
    }
  }
);

// Tool 6: Database Switch
server.tool(
  "database_switch",
  "Switches to different database. Use when: session mentions specific database, or operation reports wrong database.",
  {
    databaseName: z.string().describe("Database name to switch to")
  },
  async ({ databaseName }) => {
    try {
      const { databaseHandler } = await ensureHandlersInitialized();
      if (!databaseHandler) {
        throw new Error("Database handler not initialized");
      }
      const databaseInfo = await databaseHandler.handleDatabaseSwitch(databaseName);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(databaseInfo, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            { error: "Failed to switch database", details: String(error) },
            null, 2
          ),
        }],
      };
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
    console.error("[MCP Server] Failed to start:", error);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Export clean components for testing
export { McpMemoryHandler, McpObservationHandler, McpRelationHandler, McpDatabaseHandler };
