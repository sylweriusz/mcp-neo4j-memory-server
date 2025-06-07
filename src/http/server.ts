#!/usr/bin/env node

/**
 * HTTP Transport Server - Working Implementation
 * The Implementor's Rule: Build exactly what works, nothing more
 */

// CRITICAL: Load environment first
import { config } from "dotenv";
config();

import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Import existing MCP handlers
import { 
  McpMemoryHandler, 
  McpObservationHandler, 
  McpRelationHandler, 
  McpDatabaseHandler 
} from "../application/mcp-handlers";
import { MemoryObject } from "../types";

/**
 * Create and configure MCP server with tools
 * Based on index.ts - exact same functionality
 */
function createMCPServer(): McpServer {
  const server = new McpServer({
    name: "neo4j-memory-server",
    version: "2.3.1"
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
      
      // Database initialization deferred to first actual operation
      // No blocking database operations during tool registration
    } catch (error) {
      // Reset for retry
      memoryHandler = null;
      observationHandler = null;
      relationHandler = null;
      databaseHandler = null;
      initializationPromise = null;
      throw error;
    }
  };

  // Register memory_manage tool (copied from index.ts)
  server.tool(
    "memory_manage",
    "Create, update, or delete memories in the knowledge graph.",
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
    async (args) => {
      const { identifiers } = args;
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
            text: JSON.stringify({ error: "Error retrieving memories", details: String(error) }, null, 2),
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
    async (args) => {
      const { query, limit = 10, includeGraphContext = true, memoryTypes, threshold = 0.1 } = args;
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
            text: JSON.stringify({ error: "Error searching memories", details: String(error) }, null, 2),
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
    async (args) => {
      const { operation, observations } = args;
      try {
        const { observationHandler } = await ensureHandlersInitialized();
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
            text: JSON.stringify({ error: "Error managing observations", details: String(error) }, null, 2),
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
    async (args) => {
      const { operation, relations } = args;
      try {
        const { relationHandler } = await ensureHandlersInitialized();
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
            text: JSON.stringify({ error: "Error managing relations", details: String(error) }, null, 2),
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
    async (args) => {
      const { databaseName } = args;
      try {
        const { databaseHandler } = await ensureHandlersInitialized();
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
            text: JSON.stringify({ error: "Error switching database", details: String(error) }, null, 2),
          }],
        };
      }
    }
  );

  // Add remaining tools here as needed
  return server;
}

/**
 * Simple HTTP Transport Server
 * Based on working patterns from SDK examples
 */
class SimpleHTTPServer {
  private app: express.Application;
  private mcpServer: McpServer;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  constructor() {
    this.app = express();
    this.mcpServer = createMCPServer();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    
    // CORS
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      
      if (req.method === 'OPTIONS') {
        res.status(200).send();
        return;
      }
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        sessions: this.transports.size,
        transport: 'streamable-http'
      });
    });

    // MCP endpoint - stateful session pattern
    this.app.all('/mcp', async (req, res) => {
      try {
        await this.handleMCPRequest(req, res);
      } catch (error) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        });
      }
    });
  }
  private async handleMCPRequest(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    // ✅ FIXED: Removed problematic query parameter configuration
    // Configuration now comes from environment variables only
    
    if (req.method === 'DELETE') {
      // Session termination
      if (sessionId && this.transports.has(sessionId)) {
        this.transports.delete(sessionId);
        res.status(204).send();
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
      return;
    }

    if (req.method === 'GET') {
      // MCP status endpoint for deployment verification
      res.json({
        status: 'MCP endpoint ready',
        protocol: 'streamable-http',
        endpoints: {
          health: '/health',
          mcp: '/mcp'
        },
        message: 'Use POST for MCP communication'
      });
      return;
    }

    if (req.method === 'POST') {
      let transport: StreamableHTTPServerTransport;
      let newSessionId: string | undefined;

      if (sessionId && this.transports.has(sessionId)) {
        // Use existing session
        transport = this.transports.get(sessionId)!;
      } else if (isInitializeRequest(req.body)) {
        // Create new session
        newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId!,
        });
        
        // Connect to MCP server
        await this.mcpServer.connect(transport);
        this.transports.set(newSessionId, transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Missing session ID" },
          id: null
        });
        return;
      }

      // Handle the request using transport
      await transport.handleRequest(req, res, req.body);
    }
  }

  public async start(port: number = 3000): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(port, '0.0.0.0', () => {
        // Silent startup for deployment compatibility
        resolve();
      });
    });
  }
}

// Main entry point
const main = async () => {
  // Silent startup for HTTP server (separate from stdio MCP)
  const httpServer = new SimpleHTTPServer();
  const port = parseInt(process.env.PORT || process.env.HTTP_PORT || '3000');
  
  try {
    await httpServer.start(port);
    
    const cleanup = () => process.exit(0);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    
  } catch (error) {
    // Silent error handling for deployment compatibility
    process.exit(1);
  }
};

// Export for testing
export { SimpleHTTPServer };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.exit(1);
  });
}
