#!/usr/bin/env node

// CRITICAL: Load environment variables FIRST, before any other imports
import dotenv from "dotenv";
dotenv.config();

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
  version: "2.0.11"  // Clean Architecture Complete - Consolidated Directory Eliminated
});

// Lazy initialization - only connect when tools are actually called
let memoryHandler: McpMemoryHandler | null = null;
let observationHandler: McpObservationHandler | null = null;
let relationHandler: McpRelationHandler | null = null;
let databaseHandler: McpDatabaseHandler | null = null;

const getHandlers = async () => {
  if (!memoryHandler) {
    try {
      console.error("[MCP Server] Initializing Clean Architecture Handlers...");
      memoryHandler = new McpMemoryHandler();
      observationHandler = new McpObservationHandler();
      relationHandler = new McpRelationHandler();
      databaseHandler = new McpDatabaseHandler();
      
      // CRITICAL: Initialize database schema and indexes
      const container = DIContainer.getInstance();
      await container.initializeDatabase();
      console.error("[MCP Server] Database schema and indexes initialized");
      
      console.error("[MCP Server] Clean Architecture handlers initialized successfully");
    } catch (error) {
      console.error("[MCP Server] Failed to initialize handlers:", error);
      throw error;
    }
  }
  return { memoryHandler, observationHandler, relationHandler, databaseHandler };
};

// Tool 1: Memory Management 
server.tool(
  "memory_manage",
  "Create, update, or delete memories in the knowledge graph. This is the primary tool for managing memory lifecycle.",
  {
    operation: z.enum(['create', 'update', 'delete']).describe("Operation type"),
    memories: z.array(MemoryObject).optional().describe("Memories to create"),
    updates: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
      memoryType: z.string().optional(),
      metadata: z.record(z.any()).optional(),
      tags: z.array(z.string()).optional()
    })).optional(),
    identifiers: z.array(z.string()).optional()
  },
  async ({ operation, memories, updates, identifiers }) => {
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
  "Retrieve specific memories by their IDs with full details including observations, tags, metadata, and graph context.",
  {
    identifiers: z.array(z.string()).describe("Array of memory IDs to retrieve"),
  },
  async ({ identifiers }) => {
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
  "Search for memories using semantic search, metadata matching, and tag filtering.",
  {
    query: z.string().describe("Natural language search query or '*' for all memories"),
    limit: z.number().optional().describe("Maximum number of results to return (default: 10)"),
    includeGraphContext: z.boolean().optional().describe("Include related memories (default: true)"),
    memoryTypes: z.array(z.string()).optional().describe("Filter by memory types"),
    threshold: z.number().optional().describe("Minimum relevance score threshold (default: 0.1)"),
  },
  async ({ query, limit = 10, includeGraphContext = true, memoryTypes, threshold = 0.1 }) => {
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
  "Add or delete observations from memories in the knowledge graph.",
  {
    operation: z.enum(['add', 'delete']).describe("Operation type: 'add' or 'delete'"),
    observations: z.array(z.object({
      memoryId: z.string().describe("Memory ID"),
      contents: z.array(z.string()).describe("Array of observation texts to add or delete")
    })).describe("Observations to manage")
  },
  async ({ operation, observations }) => {
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
  "Create or delete directional relationships between memories with enhanced metadata support.",
  {
    operation: z.enum(['create', 'delete']).describe("Operation type: 'create' or 'delete'"),
    relations: z.array(z.object({
      fromId: z.string().describe("Source memory ID"),
      toId: z.string().describe("Target memory ID"),
      relationType: z.string().describe("Relation type describing the connection"),
      // BUG #3 FIX: Enhanced relationship metadata (GDD v2.0.12+)
      strength: z.number().min(0.0).max(1.0).optional().describe("Relationship strength 0.0-1.0 (default: 0.5)"),
      context: z.array(z.string()).optional().describe("Domain contexts (auto-inferred if not provided)"),
      source: z.enum(['agent', 'user', 'system']).optional().describe("Relationship origin (default: 'agent')")
      // createdAt is always system-generated
    })).describe("Relations to manage")
  },
  async ({ operation, relations }) => {
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
  "Switch to a different Neo4j database for memory storage.",
  {
    databaseName: z.string().describe("The name of the database to switch to")
  },
  async ({ databaseName }) => {
    try {
      const { databaseHandler } = await getHandlers();
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
    console.error("[MCP Server] Starting neo4j-memory-server v2.0.11...");
    console.error("[MCP Server] Clean Architecture - Consolidated Directory Eliminated");
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[MCP Server] Neo4j Memory Server running with 6 clean architecture tools");

    const cleanup = async () => {
      console.error("[MCP Server] Shutting down...");
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
