// Database management tools to add to index.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DatabaseManager } from "./database_manager";
import { Neo4jKnowledgeGraphManager } from "./manager";

/**
 * Add database management tools to an MCP server
 * @param server The MCP server to add tools to
 * @param knowledgeGraphManager The Neo4j knowledge graph manager
 */
export function addDatabaseTools(
  server: McpServer,
  knowledgeGraphManager: Neo4jKnowledgeGraphManager
): void {
  // Create Database Manager
  const databaseManager = new DatabaseManager(knowledgeGraphManager);

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
}
