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
    
    // Extract configuration from query parameters for Smithery compatibility
    if (req.query) {
      this.applyConfigFromQuery(req.query);
    }
    
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

  /**
   * Apply configuration from Smithery query parameters
   */
  private applyConfigFromQuery(query: any): void {
    if (query.neo4jUri && typeof query.neo4jUri === 'string') {
      process.env.NEO4J_URI = query.neo4jUri;
      process.stderr.write(`[MCP HTTP Server] Config: NEO4J_URI set from query\n`);
    }
    if (query.neo4jUsername && typeof query.neo4jUsername === 'string') {
      process.env.NEO4J_USERNAME = query.neo4jUsername;
      process.stderr.write(`[MCP HTTP Server] Config: NEO4J_USERNAME set from query\n`);
    }
    if (query.neo4jPassword && typeof query.neo4jPassword === 'string') {
      process.env.NEO4J_PASSWORD = query.neo4jPassword;
      process.stderr.write(`[MCP HTTP Server] Config: NEO4J_PASSWORD set from query\n`);
    }
    if (query.neo4jDatabase && typeof query.neo4jDatabase === 'string') {
      process.env.NEO4J_DATABASE = query.neo4jDatabase;
      process.stderr.write(`[MCP HTTP Server] Config: NEO4J_DATABASE set from query\n`);
    }
  }

  public async start(port: number = 3000): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        process.stderr.write(`[MCP HTTP Server] Started on port ${port}\n`);
        process.stderr.write(`[MCP HTTP Server] Health check: http://localhost:${port}/health\n`);
        process.stderr.write(`[MCP HTTP Server] MCP endpoint: http://localhost:${port}/mcp\n`);
        resolve();
      });
    });
  }
}

// Main entry point
const main = async () => {
  // HTTP mode logging - safe since we're not using stdio
  process.stderr.write("[MCP HTTP Server] Starting up...\n");
  process.stderr.write(`[MCP HTTP Server] Environment check:\n`);
  process.stderr.write(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}\n`);
  process.stderr.write(`  PORT: ${process.env.PORT || 'not set'}\n`);
  process.stderr.write(`  HTTP_PORT: ${process.env.HTTP_PORT || 'not set'}\n`);
  process.stderr.write(`  NEO4J_URI: ${process.env.NEO4J_URI ? 'set' : 'not set'}\n`);
  
  const httpServer = new SimpleHTTPServer();
  const port = parseInt(process.env.PORT || process.env.HTTP_PORT || '3000');
  
  try {
    await httpServer.start(port);
    
    const cleanup = () => process.exit(0);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    
  } catch (error) {
    process.stderr.write(`[MCP HTTP Server] Failed to start: ${error}\n`);
    process.exit(1);
  }
};

// Export for testing
export { SimpleHTTPServer };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`[MCP HTTP Server] Startup failed: ${error}\n`);
    process.exit(1);
  });
}
