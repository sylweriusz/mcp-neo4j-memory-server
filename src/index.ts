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
  version: "2.1.3"  // SauronEye Fix: Enhanced relationship metadata + search optimization
});

// Lazy initialization - only connect when tools are actually called
let memoryHandler: McpMemoryHandler | null = null;
let observationHandler: McpObservationHandler | null = null;
let relationHandler: McpRelationHandler | null = null;
let databaseHandler: McpDatabaseHandler | null = null;

const getHandlers = async () => {
  if (!memoryHandler) {
    try {
      memoryHandler = new McpMemoryHandler();
      observationHandler = new McpObservationHandler();
      relationHandler = new McpRelationHandler();
      databaseHandler = new McpDatabaseHandler();
      
      // CRITICAL: Initialize database schema and indexes
      const container = DIContainer.getInstance();
      await container.initializeDatabase();
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
  "Create, update, or delete memories in the knowledge graph. This is the primary tool for managing memory lifecycle. Use 'memories' for create, 'updates' for update, and 'identifiers' for delete operations. When users share important information during conversation, store it in the CURRENT database without interrupting flow. STRUCTURAL APPROACH: use metadata for architectural overviews (schemas, hierarchies, key patterns, relationships) and observations for complete functional modules (step-by-step procedures, full workflows, reference data). Each observation should be self-contained and actionable, not sentence fragments. ANTI-PATTERN WARNING: If you're creating multiple memories with related names or planning to connect them with relations because they belong together, that's fragmentation - create ONE memory with multiple observations instead. Don't overthink storage location - use what you've got, where you are. The database you're in is the database you use. No exceptions. LANGUAGE REALITY & PRAGMATICS: Mixed languages WILL create duplicates. Embeddings DON'T translate. This is unfixable. Accept it and manage it. SIMPLE CREATION RULE: Follow the user's current language. User writes to you in Polish → create everything in Polish. User writes to you in English → create everything in English. Technical terms → follow user's choice (if they say 'API', use 'API'). ALWAYS add to metadata: {language: 'pl'} or {language: 'en'}. WORKFLOW RULE: Never use this without memory_search first! Exception: only when user explicitly says 'create new memory about X'. If memory_search found similar memories → use observation_manage instead. After creating memory → immediately use observation_manage to add detailed content. Creating multiple related memories? STOP - that's fragmentation. Create one memory with multiple observations.",
  {
    operation: z.enum(['create', 'update', 'delete']).describe("Operation type"),
    memories: z.array(MemoryObject).optional().describe("Memories to create"),
    updates: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
      memoryType: z.string().optional(),
      metadata: z.record(z.any()).optional()
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
  "Retrieve specific memories by their IDs with full details including observations, metadata, and graph context (related memories). Use this when you need complete information about specific memories. When users reference past information without explicit IDs, use memory_search first, then memory_retrieve with the found IDs. STRUCTURAL PATTERN: metadata provides architectural context while observations contain complete, actionable modules. When referencing retrieved information, leverage this structure for comprehensive responses. Only search in the CURRENT database - if it's not where you are, it doesn't exist for this operation. WHEN TO USE: When you have specific memory IDs and need to update lastAccessed timestamp. When you need relations BETWEEN specific memories (not just their individual contexts). When you need multiple specific memories by ID. NOT needed after search - search already returns full content including observations. Main difference: this tool updates access timestamps and returns inter-memory relations.",
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
  "Search for memories using semantic search and metadata matching. Supports natural language queries and returns ranked results with scores. Use '*' to search all memories with the specified limit. When users reference past information ('remember when...', 'as discussed earlier...'), use this tool to search the CURRENT database only. HINT: Well-structured memories use metadata for structural overview and observations for complete procedural modules - this prevents information fragmentation and creates maintainable knowledge. Never assume memories exist - verify first, admit gaps honestly. Search exactly where you are, not where you wish you were. CROSS-LANGUAGE SEARCH VERIFIED: Tested fact: 'książka' search returns 0 results for 'book' memories. Embeddings work WITHIN languages, not across. DAMAGE CONTROL TOOLS: 1) When searching: if no results → try other language variants. 2) Periodic cleanup: search '*' to spot duplicate patterns (similar names in different languages, same creation date ± few days, same memoryType). 3) When duplicates found: connect with 'TRANSLATES_TO' relation. 4) Search strategy for cross-language: First exact search in current language, then search in English (most common), finally wildcard with language in metadata. WORKFLOW HINT: This is typically your FIRST tool. Before creating anything, search first. Common patterns: User mentions previous topic → search for it before assuming it doesn't exist. Starting work in new database → search '*' limit:20 to see what's already there. No results in current language? → try English variants or check metadata.language field. Search returns FULL memory content including observations when includeGraphContext=true (default). SYSTEM HEALTH CHECK: Run memory_search('*', limit: 100) periodically to assess: ✅ Healthy signs: Most memories have 3-10 observations, clear naming patterns, <5 relations per memory, consistent language within memories. ⚠️ Warning signs: Many 1-observation memories (fragmentation), names like 'Notes', 'Misc', 'TODO', mixed languages in single memory, relation spaghetti (>10 relations per memory).",
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
  "Add or delete observations from memories in the knowledge graph. Use this to add new details or remove specific observations from existing memories. When users provide additional context to previously discussed topics, add these details to existing memories in the CURRENT database. When adding observations, create COMPLETE FUNCTIONAL MODULES rather than fragments - each observation should contain full procedures, workflows, or reference sections that can stand alone. DECISION CRITERIA: Can someone accomplish the task using only this observation? If NO, you're fragmenting. If YES, you're creating a proper module. Avoid fragmenting related information across multiple observations. No database hopping - if it's not where you are, it doesn't exist for this operation. LANGUAGE CONSISTENCY: Match the language of the parent memory. If memory name is in Polish, observations must be in Polish. If memory name is in English, observations must be in English. WHEN TO USE: This is your PRIMARY tool for adding information to existing memories. Found memory via search? → Use this, not memory_manage. Memory has 20+ observations already? → Consider creating new memory with relation instead. Always check parent memory language first - observations must match. PRACTICAL LIMITS: Sweet spot: 5-15 observations per memory. 20+ observations = consider splitting memory. 50+ observations = definite performance impact. Each observation adds ~100ms to retrieval time in large graphs.",
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
  `Create or delete directional relationships between memories.

**Parameters:**
- **strength** (0.0-1.0): Relationship importance. Higher = stronger connection. Default: 0.5
- **source**: Who created this relationship
  - "agent": You analyzed content and found a connection (default)
  - "user": User explicitly requested this connection  
  - "system": Automatically generated

**Examples:**
\`\`\`javascript
// Strong influence
{"relationType": "INFLUENCES", "strength": 0.9, "source": "agent"}

// User-requested link  
{"relationType": "RELATES_TO", "strength": 0.6, "source": "user"}

// Weak association
{"relationType": "SUGGESTS", "strength": 0.2, "source": "agent"}
\`\`\``,
  {
    operation: z.enum(['create', 'delete']).describe("Operation type: 'create' or 'delete'"),
    relations: z.array(z.object({
      fromId: z.string().describe("Source memory ID"),
      toId: z.string().describe("Target memory ID"),
      relationType: z.string().describe("Relation type describing the connection (INFLUENCES, DEPENDS_ON, COMPLEMENTS, REQUIRES, etc.)"),
      
      // Enhanced relationship metadata (simplified without context complexity)
      strength: z.number().min(0.0).max(1.0).optional().describe("Relationship strength 0.0-1.0 (default: 0.5) - quantifies connection significance"),
      source: z.enum(['agent', 'user', 'system']).optional().describe("Relationship origin: 'agent' (default analysis), 'user' (explicit request), 'system' (automatic)")
      
      // createdAt is always system-generated for temporal intelligence
    })).describe("Relations to manage with enhanced metadata for intelligent context understanding")
  },
  async ({ operation, relations }) => {
    try {
      const { relationHandler } = await getHandlers();
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
  "Switch to a different Neo4j database for memory storage. Each database provides complete isolation. Databases are created automatically if they don't exist. Use this BEFORE any memory operation if you need to change context. The database you're in after this call is where all subsequent memory operations will work. STRUCTURAL TIP: Organize databases by project or domain to maintain clean knowledge architecture. Choose wisely, and remember where you are. LANGUAGE ORGANIZATION STRATEGY: Databases are isolated universes - no cross-database search or relations. Best practices: One language per database (e.g., 'projekty-pl', 'projects-en'), or one domain per database with consistent language. Include language hint in database name to prevent confusion (e.g., 'work-en', 'personal-pl'). Switching is instant but context is lost - stay in one database per conversation topic. CONTEXT WARNING: Switching databases loses ALL context. No cross-database search exists. Before switching → Complete current task in current database. After switching → Use memory_search('*') to orient yourself in new context. Working with multilingual content? → Consider language-specific databases.",
  {
    databaseName: z.string().describe("The name of the database to switch to")
  },
  async ({ databaseName }) => {
    try {
      const { databaseHandler } = await getHandlers();
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
