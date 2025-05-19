#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Neo4jKnowledgeGraphManager } from "./manager";
import { NullLogger } from "./logger";
import { DatabaseManager } from "./database_manager";
import { ConsolidatedToolHandlers } from "./consolidated/handlers";
import { MemoryObject } from "./types";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Create an MCP server with proper configuration
const server = new McpServer({
  name: "neo4j-memory-server",
  version: "2.0.2"  // Version with deep lazy loading fix
});

const logger = new NullLogger();

// Lazy initialization - only connect when tools are actually called
let knowledgeGraphManager: Neo4jKnowledgeGraphManager | null = null;
let databaseManager: DatabaseManager | null = null;
let toolHandlers: ConsolidatedToolHandlers | null = null;

const getManagers = () => {
  if (!knowledgeGraphManager) {
    knowledgeGraphManager = new Neo4jKnowledgeGraphManager(
      () => {
        return {
          uri: process.env.NEO4J_URI || "bolt://localhost:7687",
          username: process.env.NEO4J_USERNAME || "neo4j", 
          password: process.env.NEO4J_PASSWORD || "password",
          database: process.env.NEO4J_DATABASE || "neo4j",
        };
      },
      logger
    );
    databaseManager = new DatabaseManager(knowledgeGraphManager);
    toolHandlers = new ConsolidatedToolHandlers(knowledgeGraphManager);
  }
  return { knowledgeGraphManager, databaseManager, toolHandlers };
};

// CONSOLIDATED TOOLS (6 total, down from 10)

// Tool 1: Memory Management - Enhanced with examples
server.tool(
  "memory_manage",
  "Create, update, or delete memories in the knowledge graph. This is the primary tool for managing memory lifecycle. Use 'memories' for create, 'updates' for update, and 'identifiers' for delete operations.",
  {
    operation: z.enum(['create', 'update', 'delete']).describe("Operation type: 'create' for new memories, 'update' to modify existing ones, 'delete' to remove memories"),
    memories: z.array(MemoryObject).optional().describe(`Memories to create. Each memory needs name, memoryType, and observations. Example:
    [{
      "name": "React Development Project",
      "memoryType": "project", 
      "observations": ["Building React app", "Using TypeScript"],
      "metadata": {"status": "active"}
    }]`),
    updates: z.array(z.object({
      id: z.string().describe("Memory ID to update (e.g., 'Bm\\\\jstsj8@yCf)wF>')"),
      name: z.string().optional().describe("New name for the memory"),
      memoryType: z.string().optional().describe("New memory type (e.g., 'project', 'research')"),
      metadata: z.record(z.any()).optional().describe("New metadata object to replace existing"),
      tags: z.array(z.string()).optional().describe("New tags (usually auto-generated from name)")
    })).optional().describe(`Updates to apply. Example:
    [{
      "id": "Bm\\\\jstsj8@yCf)wF>",
      "name": "Updated Memory Name",
      "memoryType": "business"
    }]`),
    identifiers: z.array(z.string()).optional().describe(`Memory IDs to delete. Example: ["Bm\\\\jstsj8@yCf)wF>", "Bm\\\\abc123"]`)
  },
  async ({ operation, memories, updates, identifiers }) => {
    try {
      const { toolHandlers } = getManagers();
      let result;
      switch (operation) {
        case 'create':
          if (!memories) throw new Error("memories field required for create operation");
          result = await toolHandlers.handleMemoryManage({ operation, memories });
          break;
        case 'update':
          if (!updates) throw new Error("updates field required for update operation");
          result = await toolHandlers.handleMemoryManage({ operation, updates });
          break;
        case 'delete':
          if (!identifiers) throw new Error("identifiers field required for delete operation");
          result = await toolHandlers.handleMemoryManage({ operation, identifiers });
          break;
        default:
          throw new Error(`Invalid operation: ${operation}`);
      }
      
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

// Tool 2: Memory Retrieval - Enhanced with examples
server.tool(
  "memory_retrieve",
  "Retrieve specific memories by their IDs with full details including observations, tags, metadata, and graph context (related memories). Use this when you need complete information about specific memories.",
  {
    identifiers: z.array(z.string()).describe(`Array of memory IDs to retrieve. Example: ["Bm\\\\jstsj8@yCf)wF>", "Bm\\\\abc123"]. Always use the exact IDs returned from search or create operations.`),
  },
  async ({ identifiers }) => {
    try {
      const { toolHandlers } = getManagers();
      const result = await toolHandlers.handleMemoryRetrieve(identifiers);
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

// Tool 3: Memory Search - Enhanced with examples  
server.tool(
  "memory_search",
  "Search for memories using semantic search, metadata matching, and tag filtering. Supports natural language queries and returns ranked results with scores. Use '*' to get all memories (lightweight mode).",
  {
    query: z.string().describe("Natural language search query (e.g., 'React development project', 'machine learning', 'photography business') or '*' for all memories"),
    limit: z.number().optional().describe("Maximum number of results to return (default: 10, use 0 for no limit)"),
    includeGraphContext: z.boolean().optional().describe("Include related memories (ancestors/descendants) in results (default: true)"),
    memoryTypes: z.array(z.string()).optional().describe(`Filter by memory types. Example: ["project", "research"]. Common types: project, research, business, hobby, learning`),
    threshold: z.number().optional().describe("Minimum relevance score threshold (default: 0.1, range: 0.0-1.0)"),
  },
  async ({ query, limit = 10, includeGraphContext = true, memoryTypes, threshold = 0.1 }) => {
    try {
      const { toolHandlers } = getManagers();
      const result = await toolHandlers.handleMemorySearch(
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

// Tool 4: Observation Management - Enhanced with examples
server.tool(
  "observation_manage",
  "Add or delete observations from memories in the knowledge graph. Use this to add new details or remove specific observations from existing memories. Always use the 'observations' parameter (not 'operations').",
  {
    operation: z.enum(['add', 'delete']).describe("Operation type: 'add' to add new observations, 'delete' to remove existing ones"),
    observations: z.array(z.object({
      memoryId: z.string().describe("Memory ID (e.g., 'Bm\\\\jstsj8@yCf)wF>')"),
      contents: z.array(z.string()).describe("Array of observation texts to add or delete")
    })).describe(`Observations to manage. Example:
    [{
      "memoryId": "Bm\\\\jstsj8@yCf)wF>", 
      "contents": ["New observation text", "Another observation"]
    }]`)
  },
  async ({ operation, observations }) => {
    try {
      const { toolHandlers } = getManagers();
      const result = await toolHandlers.handleObservationManage({ operation, observations });
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
              details: String(error),
              hint: "Make sure to use the 'observations' parameter (not 'operations') with an array of objects containing 'memoryId' and 'contents' fields."
            },
            null, 2
          ),
        }],
      };
    }
  }
);

// Tool 5: Relation Management - Enhanced with examples
server.tool(
  "relation_manage", 
  "Create or delete directional relationships between memories. Relations help build knowledge graphs showing how memories connect. Use meaningful relation types to describe the relationship nature.",
  {
    operation: z.enum(['create', 'delete']).describe("Operation type: 'create' to add new relations, 'delete' to remove existing ones"),
    relations: z.array(z.object({
      fromId: z.string().describe("Source memory ID (e.g., 'Bm\\\\jstsj8@yCf)wF>')"),
      toId: z.string().describe("Target memory ID (e.g., 'Bm\\\\abc123')"),
      relationType: z.string().describe(`Relation type describing the connection. Examples: 'RELATES_TO', 'DEPENDS_ON', 'INFLUENCES', 'COMPLEMENTS', 'BLOCKS', 'FOLLOWS'`)
    })).describe(`Relations to manage. Example:
    [{
      "fromId": "Bm\\\\jstsj8@yCf)wF>",
      "toId": "Bm\\\\abc123", 
      "relationType": "RELATES_TO"
    }]`)
  },
  async ({ operation, relations }) => {
    try {
      const { toolHandlers } = getManagers();
      const result = await toolHandlers.handleRelationManage({ operation, relations });
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

// Tool 6: Database Switch - Enhanced with examples  
server.tool(
  "database_switch",
  "Switch to a different Neo4j database for memory storage. Each database provides complete isolation. Databases are created automatically if they don't exist. Useful for organizing memories by project, user, or context.",
  {
    databaseName: z.string().describe(`The name of the database to switch to. Example: 'project-alpha', 'user-memories', 'test-49'. Database names should be lowercase with hyphens or underscores.`)
  },
  async ({ databaseName }) => {
    try {
      const { databaseManager } = getManagers();
      const databaseInfo = await databaseManager.switchDatabase(databaseName, true);
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
    console.error("[MCP Server] Starting neo4j-memory-server...");
    
    // Initialize transport
    const transport = new StdioServerTransport();
    console.error("[MCP Server] Transport created");
    
    // Connect server to transport
    await server.connect(transport);
    console.error("[MCP Server] Server connected to transport");
    console.error("[MCP Server] Neo4j Memory Server running on stdio with 6 consolidated tools");

    // Proper cleanup on exit
    const cleanup = async () => {
      console.error("[MCP Server] Shutting down...");
      try {
        // Close Neo4j connection if it exists
        if (knowledgeGraphManager) {
          await knowledgeGraphManager.close();
          console.error("[MCP Server] Neo4j connection closed");
        }
        process.exit(0);
      } catch (error) {
        console.error("[MCP Server] Error during cleanup:", error);
        process.exit(1);
      }
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

// Export managers factory for testing
export { getManagers, ConsolidatedToolHandlers };
