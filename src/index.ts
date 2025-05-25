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
  version: "2.0.10"  // Version with observation IDs and database info in responses
});

const logger = new NullLogger();

// Lazy initialization - only connect when tools are actually called
let knowledgeGraphManager: Neo4jKnowledgeGraphManager | null = null;
let databaseManager: DatabaseManager | null = null;
let toolHandlers: ConsolidatedToolHandlers | null = null;

const getManagers = () => {
  if (!knowledgeGraphManager) {
    try {
      console.error("[MCP Server] Initializing Neo4j connection...");
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
      console.error("[MCP Server] Managers initialized successfully");
    } catch (error) {
      console.error("[MCP Server] Failed to initialize managers:", error);
      throw error;
    }
  }
  return { knowledgeGraphManager, databaseManager, toolHandlers };
};

// CONSOLIDATED TOOLS (6 total, down from 10)

// Tool 1: Memory Management - Enhanced with anti-patterns and decision criteria
server.tool(
  "memory_manage",
  "Create, update, or delete memories in the knowledge graph. This is the primary tool for managing memory lifecycle. Use 'memories' for create, 'updates' for update, and 'identifiers' for delete operations. When users share important information during conversation, store it in the CURRENT database without interrupting flow. STRUCTURAL APPROACH: use metadata for architectural overviews (schemas, hierarchies, key patterns, relationships) and observations for complete functional modules (step-by-step procedures, full workflows, reference data). Each observation should be self-contained and actionable, not sentence fragments. ANTI-PATTERN WARNING: If you're creating multiple memories with related names or planning to connect them with relations because they belong together, that's fragmentation - create ONE memory with multiple observations instead. Don't overthink storage location - use what you've got, where you are. The database you're in is the database you use. No exceptions. LANGUAGE REALITY & PRAGMATICS: Mixed languages WILL create duplicates. Embeddings DON'T translate. This is unfixable. Accept it and manage it. SIMPLE CREATION RULE: Follow the user's current language. User writes to you in Polish → create everything in Polish. User writes to you in English → create everything in English. Technical terms → follow user's choice (if they say 'API', use 'API'). ALWAYS add to metadata: {language: 'pl'} or {language: 'en'}. WORKFLOW RULE: Never use this without memory_search first! Exception: only when user explicitly says 'create new memory about X'. If memory_search found similar memories → use observation_manage instead. After creating memory → immediately use observation_manage to add detailed content. Creating multiple related memories? STOP - that's fragmentation. Create one memory with multiple observations.",
  {
    operation: z.enum(['create', 'update', 'delete']).describe("Operation type: 'create' for new memories, 'update' to modify existing ones, 'delete' to remove memories"),
    memories: z.array(MemoryObject).optional().describe(`Memories to create. Each memory needs name, memoryType, and observations. ANTI-PATTERN EXAMPLES:
    
    ❌ FRAGMENTATION (DON'T DO THIS):
    [
      {"name": "API Guide - Authentication", "observations": ["Auth details..."]},
      {"name": "API Guide - Endpoints", "observations": ["Endpoint list..."]}, 
      {"name": "API Guide - Examples", "observations": ["Usage examples..."]}
    ]
    
    ✅ COMPLETE MODULE (DO THIS INSTEAD):
    [{
      "name": "Complete API Guide",
      "memoryType": "documentation",
      "observations": [
        "AUTHENTICATION: Complete auth workflow with examples and troubleshooting",
        "ENDPOINTS: Full endpoint reference with parameters, responses, and error codes", 
        "EXAMPLES: Working code samples for all common use cases"
      ],
      "metadata": {"schema": "REST API", "version": "v1.2", "core_endpoints": "/auth,/users,/data", "language": "en"}
    }]
    
    WARNING: If you're planning to create relations between memories because they belong together, create ONE memory with multiple observations instead.
    
    LANGUAGE CONSISTENCY EXAMPLES:
    ❌ MIXED LANGUAGE (DON'T DO THIS):
    {"name": "React hooks guide", "observations": ["useState zarządza stanem..."]}
    
    ✅ CONSISTENT LANGUAGE (DO THIS):
    {"name": "React hooks guide", "observations": ["useState manages state..."], "metadata": {"language": "en"}}
    {"name": "Przewodnik React hooks", "observations": ["useState zarządza stanem..."], "metadata": {"language": "pl"}}`),
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

// Tool 2: Memory Retrieval - Enhanced with structural awareness + workflow guidance
server.tool(
  "memory_retrieve",
  "Retrieve specific memories by their IDs with full details including observations, tags, metadata, and graph context (related memories). Use this when you need complete information about specific memories. When users reference past information without explicit IDs, use memory_search first, then memory_retrieve with the found IDs. STRUCTURAL PATTERN: metadata provides architectural context while observations contain complete, actionable modules. When referencing retrieved information, leverage this structure for comprehensive responses. Only search in the CURRENT database - if it's not where you are, it doesn't exist for this operation. WHEN TO USE: When you have specific memory IDs and need to update lastAccessed timestamp. When you need relations BETWEEN specific memories (not just their individual contexts). When you need multiple specific memories by ID. NOT needed after search - search already returns full content including observations. Main difference: this tool updates access timestamps and returns inter-memory relations.",
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

// Tool 3: Memory Search - Enhanced with structural guidance + full functionality
server.tool(
  "memory_search",
  "Search for memories using semantic search, metadata matching, and tag filtering. Supports natural language queries and returns ranked results with scores. Use '*' to search all memories with the specified limit. When users reference past information ('remember when...', 'as discussed earlier...'), use this tool to search the CURRENT database only. HINT: Well-structured memories use metadata for structural overview and observations for complete procedural modules - this prevents information fragmentation and creates maintainable knowledge. Never assume memories exist - verify first, admit gaps honestly. Search exactly where you are, not where you wish you were. CROSS-LANGUAGE SEARCH VERIFIED: Tested fact: 'książka' search returns 0 results for 'book' memories. Embeddings work WITHIN languages, not across. DAMAGE CONTROL TOOLS: 1) When searching: if no results → try other language variants. 2) Periodic cleanup: search '*' to spot duplicate patterns (similar names in different languages, same creation date ± few days, same memoryType). 3) When duplicates found: connect with 'TRANSLATES_TO' relation. 4) Search strategy for cross-language: First exact search in current language, then search in English (most common), finally wildcard with language in metadata. WORKFLOW HINT: This is typically your FIRST tool. Before creating anything, search first. Common patterns: User mentions previous topic → search for it before assuming it doesn't exist. Starting work in new database → search '*' limit:20 to see what's already there. No results in current language? → try English variants or check metadata.language field. Search returns FULL memory content including observations when includeGraphContext=true (default). SYSTEM HEALTH CHECK: Run memory_search('*', limit: 100) periodically to assess: ✅ Healthy signs: Most memories have 3-10 observations, clear naming patterns, <5 relations per memory, consistent language within memories. ⚠️ Warning signs: Many 1-observation memories (fragmentation), names like 'Notes', 'Misc', 'TODO', mixed languages in single memory, relation spaghetti (>10 relations per memory).",
  {
    query: z.string().describe("Natural language search query (e.g., 'React development project', 'machine learning', 'photography business') or '*' for all memories"),
    limit: z.number().optional().describe("Maximum number of results to return (default: 10, recommended: 50-100 for exploration)"),
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

// Tool 4: Observation Management - Enhanced with modular guidance + fragmentation warnings
server.tool(
  "observation_manage",
  "Add or delete observations from memories in the knowledge graph. Use this to add new details or remove specific observations from existing memories. When users provide additional context to previously discussed topics, add these details to existing memories in the CURRENT database. When adding observations, create COMPLETE FUNCTIONAL MODULES rather than fragments - each observation should contain full procedures, workflows, or reference sections that can stand alone. DECISION CRITERIA: Can someone accomplish the task using only this observation? If NO, you're fragmenting. If YES, you're creating a proper module. Avoid fragmenting related information across multiple observations. No database hopping - if it's not where you are, it doesn't exist for this operation. LANGUAGE CONSISTENCY: Match the language of the parent memory. If memory name is in Polish, observations must be in Polish. If memory name is in English, observations must be in English. WHEN TO USE: This is your PRIMARY tool for adding information to existing memories. Found memory via search? → Use this, not memory_manage. Memory has 20+ observations already? → Consider creating new memory with relation instead. Always check parent memory language first - observations must match. PRACTICAL LIMITS: Sweet spot: 5-15 observations per memory. 20+ observations = consider splitting memory. 50+ observations = definite performance impact. Each observation adds ~100ms to retrieval time in large graphs.",
  {
    operation: z.enum(['add', 'delete']).describe("Operation type: 'add' to add new observations, 'delete' to remove existing ones"),
    observations: z.array(z.object({
      memoryId: z.string().describe("Memory ID (e.g., 'Bm\\\\jstsj8@yCf)wF>')"),
      contents: z.array(z.string()).describe("Array of observation texts to add OR observation IDs to delete. For deletion: PREFERRED to use observation IDs (17-char BASE91 like 'BnL\\\\P>E!A|[VW#.?=') for precise targeting. Can also use content strings for backward compatibility, but IDs are cleaner and unambiguous.")
    })).describe(`Observations to manage. Each observation should be a COMPLETE FUNCTIONAL MODULE.
    
    DECISION TEST: "Can someone accomplish the task using only this observation?"
    
    For delete operations: contents can be either observation IDs (17-char BASE91) or content strings for backward compatibility.
    
    ❌ FRAGMENTED (DON'T DO THIS):
    [{
      "memoryId": "Bm\\\\abc123",
      "contents": [
        "Step 1: Initialize the database",
        "Step 2: Configure settings", 
        "Step 3: Run migration"
      ]
    }]
    
    ✅ COMPLETE MODULE (DO THIS INSTEAD):
    [{
      "memoryId": "Bm\\\\abc123",
      "contents": [
        "DATABASE SETUP: Initialize with 'npm run db:init', configure .env with DB_URL=postgresql://..., run migrations with 'npm run migrate', verify with 'npm run db:check'. Troubleshooting: if connection fails, check port 5432 is open."
      ]
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

// Tool 5: Relation Management - Enhanced with structural connections + operational clarity
server.tool(
  "relation_manage", 
  "Create or delete directional relationships between memories. Relations help build knowledge graphs showing how memories connect. Use meaningful relation types to describe the relationship nature. Use meaningful relation types that reflect actual structural relationships from metadata schemas. Connections should be made in the CURRENT database only. If memories need relating, they better be in the same neighborhood, or they don't get connected. PERFORMANCE IMPACT: Each relation enables 2-level graph traversal in BOTH directions. With 10 memories having 5 relations each = 250+ nodes checked per search. Relations are NOT just metadata - they're active query paths. Only create relations that represent REAL dependencies you'll traverse. CROSS-LANGUAGE RELATIONS: Use 'TRANSLATES_TO' to connect duplicate memories in different languages (e.g., 'Structure' TRANSLATES_TO 'Struktura'). CONNECTIVITY RULE: Every memory (except top-level categories) MUST have at least one relation. Orphaned memories are lost memories. After creating new memory → IMMEDIATELY connect it to relevant context. Common patterns: New discovery → RELATES_TO existing research. Sub-topic → PART_OF parent topic. Implementation → IMPLEMENTS concept. Translation → TRANSLATES_TO original. USE SPARINGLY BUT PURPOSEFULLY: 0 relations = orphaned memory (BAD - will be lost!). 1-3 relations = well-connected (GOOD). 5+ relations = potential hub (CAREFUL - might be doing too much). 10+ relations = definite smell (REFACTOR - split into sub-memories). Before creating relation, ask: 'Will anyone traverse this path?' Found duplicate in different language? → TRANSLATES_TO is mandatory. Memory seems standalone? → Find its category/context and connect with PART_OF.",
  {
    operation: z.enum(['create', 'delete']).describe("Operation type: 'create' to add new relations, 'delete' to remove existing ones"),
    relations: z.array(z.object({
      fromId: z.string().describe("Source memory ID (e.g., 'Bm\\\\jstsj8@yCf)wF>')"),
      toId: z.string().describe("Target memory ID (e.g., 'Bm\\\\abc123')"),
      relationType: z.string().describe(`Relation type describing the connection. Examples: 'RELATES_TO', 'DEPENDS_ON', 'INFLUENCES', 'COMPLEMENTS', 'BLOCKS', 'FOLLOWS', 'TRANSLATES_TO', 'PART_OF', 'IMPLEMENTS'`)
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

// Tool 6: Database Switch - Enhanced with structural organization + operational details
server.tool(
  "database_switch",
  "Switch to a different Neo4j database for memory storage. Each database provides complete isolation. Databases are created automatically if they don't exist. Use this BEFORE any memory operation if you need to change context. The database you're in after this call is where all subsequent memory operations will work. STRUCTURAL TIP: Organize databases by project or domain to maintain clean knowledge architecture. Choose wisely, and remember where you are. LANGUAGE ORGANIZATION STRATEGY: Databases are isolated universes - no cross-database search or relations. Best practices: One language per database (e.g., 'projekty-pl', 'projects-en'), or one domain per database with consistent language. Include language hint in database name to prevent confusion (e.g., 'work-en', 'personal-pl'). Switching is instant but context is lost - stay in one database per conversation topic. CONTEXT WARNING: Switching databases loses ALL context. No cross-database search exists. Before switching → Complete current task in current database. After switching → Use memory_search('*') to orient yourself in new context. Working with multilingual content? → Consider language-specific databases.",
  {
    databaseName: z.string().describe(`The name of the database to switch to. Example: 'project-alpha', 'user-memories', 'test-49', 'projekty-pl', 'projects-en'. Database names should be lowercase with hyphens or underscores. Consider adding language suffix for clarity.`)
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
    console.error("[MCP Server] Process args:", process.argv);
    console.error("[MCP Server] Environment check - stdin.isTTY:", process.stdin.isTTY);
    
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
