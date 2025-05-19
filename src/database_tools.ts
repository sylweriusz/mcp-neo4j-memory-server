// Database management tools to add to index.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DatabaseManager } from "./database_manager";
import { Neo4jKnowledgeGraphManager } from "./manager";
import { isValidCompactId } from "./id_generator";

/**
 * Check ID format type
 * @param id Memory ID
 * @returns Format type: 'uuid', 'compact', or 'unknown'
 */
export function detectIdFormat(id: string): 'uuid' | 'compact' | 'unknown' {
  if (!id) return 'unknown';
  
  // Test for UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return 'uuid';
  
  // Test for compact ID format
  if (isValidCompactId(id)) return 'compact';
  
  return 'unknown';
}

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

  // Database switching is now handled directly in index.ts as database_switch
  // This file is kept for utility functions only
}
