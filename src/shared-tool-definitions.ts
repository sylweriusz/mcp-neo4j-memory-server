/**
 * Shared Tool Definitions for MCP Memory Server
 * Eliminates duplication between stdio and HTTP transport implementations
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ENHANCED_TOOL_DESCRIPTIONS, ENHANCED_PARAMETER_DESCRIPTIONS } from "./enhanced-tool-descriptions";
import { toMCPError } from "./infrastructure/errors";

export interface HandlerSet {
  unifiedStoreHandler: any;
  unifiedFindHandler: any;
  unifiedModifyHandler: any;
  databaseHandler: any;
}

/**
 * Register all memory tools with enhanced descriptions
 * Used by both stdio and HTTP servers for consistency
 */
export function registerMemoryTools(server: McpServer, getHandlers: () => Promise<HandlerSet>) {
  
  // Tool 1: memory_store
  server.tool(
    "memory_store",
    ENHANCED_TOOL_DESCRIPTIONS.memory_store,
    {
      memories: z.array(z.object({
        name: z.string().describe(ENHANCED_PARAMETER_DESCRIPTIONS["memories.name"]),
        memoryType: z.string().describe(ENHANCED_PARAMETER_DESCRIPTIONS["memories.memoryType"]),
        localId: z.string().optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS["memories.localId"]),
        observations: z.array(z.string()).describe(ENHANCED_PARAMETER_DESCRIPTIONS["memories.observations"]),
        metadata: z.record(z.any()).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS["memories.metadata"])
      })).describe(ENHANCED_PARAMETER_DESCRIPTIONS.memories),      relations: z.array(z.object({
        from: z.string().describe("Source localId or existing memoryId"),
        to: z.string().describe("Target localId or existing memoryId"),
        type: z.string().describe("Relationship type: INFLUENCES, DEPENDS_ON, EXTENDS, IMPLEMENTS, CONTAINS, etc."),
        strength: z.number().min(0.1).max(1.0).optional().describe("0.1-1.0, defaults to 0.5"),
        source: z.enum(['agent', 'user', 'system']).optional().describe("defaults to 'agent'")
      })).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.relations),
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
        throw toMCPError(error);
      }
    }
  );

  // Tool 2: memory_find
  server.tool(
    "memory_find",
    ENHANCED_TOOL_DESCRIPTIONS.memory_find,
    {
      query: z.union([z.string(), z.array(z.string())]).describe(ENHANCED_PARAMETER_DESCRIPTIONS.query),
      limit: z.number().optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.limit),
      memoryTypes: z.array(z.string()).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.memoryTypes),
      includeContext: z.enum(["minimal", "full", "relations-only"]).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.includeContext),
      threshold: z.number().min(0.01).max(1.0).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.threshold),
      orderBy: z.enum(["relevance", "created", "modified", "accessed"]).optional().describe("Sort order (default: 'relevance')"),
      
      // Date-based filtering
      createdAfter: z.string().optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.createdAfter),
      createdBefore: z.string().optional().describe("ISO date or relative"),
      modifiedSince: z.string().optional().describe("ISO date or relative"),
      accessedSince: z.string().optional().describe("ISO date or relative"),
      
      // Graph traversal
      traverseFrom: z.string().optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.traverseFrom),
      traverseRelations: z.array(z.string()).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.traverseRelations),
      maxDepth: z.number().min(1).max(5).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.maxDepth),
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
        throw toMCPError(error);
      }
    }
  );

  // Tool 3: memory_modify
  server.tool(
    "memory_modify",
    ENHANCED_TOOL_DESCRIPTIONS.memory_modify,
    {
      operation: z.enum([
        "update", "delete", "batch-delete",
        "add-observations", "delete-observations", 
        "create-relations", "update-relations", "delete-relations"
      ]).describe(ENHANCED_PARAMETER_DESCRIPTIONS.operation),
      target: z.string().optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.target),
      targets: z.array(z.string()).optional().describe("Multiple IDs for batch operations"),
      changes: z.object({
        name: z.string().optional().describe("New memory name"),
        memoryType: z.string().optional().describe("New memory type"),
        metadata: z.record(z.any()).optional().describe("New metadata (replaces existing)")
      }).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.changes),
      observations: z.array(z.object({
        memoryId: z.string().describe("Target memory ID"),
        contents: z.array(z.string()).describe(ENHANCED_PARAMETER_DESCRIPTIONS["observations.contents"])
      })).optional().describe(ENHANCED_PARAMETER_DESCRIPTIONS.observations),
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
        throw toMCPError(error);
      }
    }
  );

  // Tool 4: database_switch
  server.tool(
    "database_switch",
    ENHANCED_TOOL_DESCRIPTIONS.database_switch,
    {
      databaseName: z.string().describe(ENHANCED_PARAMETER_DESCRIPTIONS.databaseName)
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
        throw toMCPError(error);
      }
    }
  );
}
