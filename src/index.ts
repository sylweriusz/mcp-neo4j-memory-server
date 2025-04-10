#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Neo4jKnowledgeGraphManager } from "./manager";
import { NullLogger } from "./logger";
import { EntityObject, ObservationObject, RelationObject, DatabaseSwitchObject } from "./types";
import { DatabaseManager } from "./database_manager";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Create an MCP server
const server = new McpServer({
  name: "neo4j-memory-server",
  version: "1.0.0",
});

const logger = new NullLogger();
const knowledgeGraphManager = new Neo4jKnowledgeGraphManager(
  /**
   * Get the Neo4j connection settings from environment variables
   * @returns The Neo4j connection configuration
   */
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

// Create Database Manager for database operations
const databaseManager = new DatabaseManager(knowledgeGraphManager);

// Create entities tool
server.tool(
  "create_entities",
  "Create multiple new entities in the knowledge graph",
  {
    entities: z.array(EntityObject),
  },
  async ({ entities }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          await knowledgeGraphManager.createEntities(entities),
          null,
          2
        ),
      },
    ],
  })
);

// Create relations tool
server.tool(
  "create_relations",
  "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
  {
    relations: z.array(RelationObject),
  },
  async ({ relations }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          await knowledgeGraphManager.createRelations(relations),
          null,
          2
        ),
      },
    ],
  })
);

// Add observations tool
server.tool(
  "add_observations",
  "Add new observations to existing entities in the knowledge graph",
  {
    observations: z.array(ObservationObject),
  },
  async ({ observations }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          await knowledgeGraphManager.addObservations(observations),
          null,
          2
        ),
      },
    ],
  })
);

// Delete entities tool
server.tool(
  "delete_entities",
  "Delete multiple entities and their associated relations from the knowledge graph",
  {
    entityNames: z
      .array(z.string())
      .describe("An array of entity names to delete"),
  },
  async ({ entityNames }) => {
    await knowledgeGraphManager.deleteEntities(entityNames);
    return {
      content: [{ type: "text", text: "Entities deleted successfully" }],
    };
  }
);

// Delete observations tool
server.tool(
  "delete_observations",
  "Delete specific observations from entities in the knowledge graph",
  {
    deletions: z.array(
      z.object({
        entityName: z
          .string()
          .describe("The name of the entity containing the observations"),
        contents: z
          .array(z.string())
          .describe("An array of observations to delete"),
      })
    ),
  },
  async ({ deletions }) => {
    await knowledgeGraphManager.deleteObservations(deletions);
    return {
      content: [{ type: "text", text: "Observations deleted successfully" }],
    };
  }
);

// Delete relations tool
server.tool(
  "delete_relations",
  "Delete multiple relations from the knowledge graph",
  {
    relations: z
      .array(
        z.object({
          from: z
            .string()
            .describe("The name of the entity where the relation starts"),
          to: z
            .string()
            .describe("The name of the entity where the relation ends"),
          relationType: z.string().describe("The type of the relation"),
        })
      )
      .describe("An array of relations to delete"),
  },
  async ({ relations }) => {
    await knowledgeGraphManager.deleteRelations(relations);
    return {
      content: [{ type: "text", text: "Relations deleted successfully" }],
    };
  }
);

// Search nodes tool
server.tool(
  "search_nodes",
  "Search for nodes in the knowledge graph based on a query",
  {
    query: z
      .string()
      .describe(
        "The search query to match against entity names, types, and observation content"
      ),
  },
  async ({ query }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          await knowledgeGraphManager.searchNodes(query),
          null,
          2
        ),
      },
    ],
  })
);

// Open nodes tool
server.tool(
  "open_nodes",
  "Open specific nodes in the knowledge graph by their names",
  {
    names: z.array(z.string()).describe("An array of entity names to retrieve"),
  },
  async ({ names }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          await knowledgeGraphManager.openNodes(names),
          null,
          2
        ),
      },
    ],
  })
);

// Switch database tool
server.tool(
  "switch_database",
  "Switch to a different Neo4j database or create a new one if it doesn't exist",
  {
    databaseName: z
      .string()
      .describe("The name of the database to switch to"),
    createIfNotExists: z
      .boolean()
      .optional()
      .describe("Whether to create the database if it doesn't exist"),
  },
  async ({ databaseName, createIfNotExists = false }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          await databaseManager.switchDatabase(databaseName, createIfNotExists),
          null,
          2
        ),
      },
    ],
  })
);

// Get current database tool
server.tool(
  "get_current_database",
  "Get information about the current Neo4j database",
  {},
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          databaseManager.getCurrentDatabase(),
          null,
          2
        ),
      },
    ],
  })
);

// List databases tool
server.tool(
  "list_databases",
  "List all available Neo4j databases",
  {},
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          await databaseManager.listDatabases(),
          null,
          2
        ),
      },
    ],
  })
);

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Neo4j Knowledge Graph MCP Server running on stdio");

  // Proper cleanup on exit
  const cleanup = async () => {
    try {
      // Close Neo4j connection
      if (knowledgeGraphManager) {
        await knowledgeGraphManager.close();
      }
      process.exit(0);
    } catch (error) {
      console.error("Error during cleanup:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
