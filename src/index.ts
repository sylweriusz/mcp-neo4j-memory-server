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
  version: "2.3.13"
});

// Lazy handler factory - safe for tool scanning
let handlerPromise: Promise<any> | null = null;
const getHandlers = async () => {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const memoryHandler = new McpMemoryHandler();
      const observationHandler = new McpObservationHandler();
      const relationHandler = new McpRelationHandler();
      const databaseHandler = new McpDatabaseHandler();
      
      // Only initialize database if we have connection config
      const hasDbConfig = process.env.NEO4J_URI || process.env.NEO4J_USERNAME;
      if (hasDbConfig) {
        const container = DIContainer.getInstance();
        await container.initializeDatabase();
      }
      
      return { memoryHandler, observationHandler, relationHandler, databaseHandler };
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
    }],
    structuredContent: {}
  };
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
  async (args) => {
    const { operation, memories, updates, identifiers } = args;
    try {
      const { memoryHandler } = await getHandlers();
      const result = await memoryHandler.handleMemoryManage({ operation, memories, updates, identifiers });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("memory_manage", error);
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
  async (args) => {
    const { identifiers } = args;
    try {
      const { memoryHandler } = await getHandlers();
      const result = await memoryHandler.handleMemoryRetrieve(identifiers);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("memory_retrieve", error);
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
  async (args) => {
    const { query, limit = 10, includeGraphContext = true, memoryTypes, threshold = 0.1 } = args;
    try {
      const { memoryHandler } = await getHandlers();
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
      return handleToolError("memory_search", error);
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
  async (args) => {
    const { operation, observations } = args;
    try {
      const { observationHandler } = await getHandlers();
      const result = await observationHandler.handleObservationManage({ operation, observations });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("observation_manage", error);
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
  async (args) => {
    const { operation, relations } = args;
    try {
      const { relationHandler } = await getHandlers();
      const result = await relationHandler.handleRelationManage({ operation, relations });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return handleToolError("relation_manage", error);
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
  async (args) => {
    const { databaseName } = args;
    try {
      const { databaseHandler } = await getHandlers();
      const databaseInfo = await databaseHandler.handleDatabaseSwitch(databaseName);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(databaseInfo, null, 2),
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
