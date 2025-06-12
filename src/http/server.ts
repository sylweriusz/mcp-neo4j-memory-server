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

// Import lazy handlers for HTTP
import { createLazyHandlers } from "./lazy-handlers";
import {
  MCPValidationError,
  MCPDatabaseError,
  MCPServiceError,
  isMCPError
} from "../infrastructure/errors";
import { registerPrompts } from "../prompts";
import { registerMemoryTools, HandlerSet } from "../shared-tool-definitions";

/**
 * Create and configure MCP server with tools
 * Based on index.ts - exact same functionality
 */
function createMCPServer(): McpServer {
  const server = new McpServer({
    name: "neo4j-memory-server",
    version: "3.2.0"
  });

  // Register prompts first
  registerPrompts(server);

  // Lazy handler factory - safe for tool scanning
  let handlerPromise: Promise<HandlerSet> | null = null;
  const getHandlers = async (): Promise<HandlerSet> => {
    if (!handlerPromise) {
      handlerPromise = (async () => {
        // Use lazy handlers that don't initialize until first use
        const handlers = await createLazyHandlers();
        
        // Only initialize database connection if we have config
        const hasDbConfig = process.env.NEO4J_URI || process.env.NEO4J_USERNAME;
        if (hasDbConfig) {
          const { DIContainer } = await import("../container/di-container");
          const container = DIContainer.getInstance();
          await container.initializeDatabase();
        }
        
        return handlers;
      })();
    }
    return handlerPromise;
  };

  // =============================================================================
  // UNIFIED TOOLS IMPLEMENTATION (Exactly 4 tools as specified)
  // =============================================================================

  // Register all memory tools using shared definitions
  registerMemoryTools(server, getHandlers);

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
    this.app.get('/health', (_req, res) => {
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
        let errorCode = -32603; // Default internal error
        let errorMessage = 'Internal server error';
        let errorData: any = undefined;
        
        // Detect specific error types
        if (isMCPError(error)) {
          const mcpError = error as any;
          if (mcpError instanceof MCPValidationError) {
            errorCode = -32602; // Invalid params
            errorMessage = mcpError.message;
            errorData = mcpError.data;
          } else if (mcpError instanceof MCPDatabaseError) {
            errorCode = -32603; // Internal error
            errorMessage = 'Database operation failed';
            errorData = { category: 'database' };
          } else if (mcpError instanceof MCPServiceError) {
            errorCode = -32603; // Internal error  
            errorMessage = 'Service unavailable';
            errorData = { category: 'service', service: (mcpError.data as any)?.service };
          }
        }
        
        res.status(500).json({
          jsonrpc: "2.0",
          error: { 
            code: errorCode, 
            message: errorMessage,
            ...(errorData && { data: errorData })
          },
          id: null
        });
      }
    });
  }
  private async handleMCPRequest(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    if (req.method === 'DELETE') {
      // Session termination
      if (sessionId && this.transports.has(sessionId)) {
        const transport = this.transports.get(sessionId)!;
        try {
          await transport.close?.();
        } catch (error) {
          // Ignore close errors
        }
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
      let responseSessionId: string | undefined;

      try {
        if (sessionId && this.transports.has(sessionId)) {
          // Use existing session
          transport = this.transports.get(sessionId)!;
          responseSessionId = sessionId;
        } else if (isInitializeRequest(req.body)) {
          // Create new session for initialize request
          responseSessionId = randomUUID();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => responseSessionId!,
          });
          
          // Store transport before connecting
          this.transports.set(responseSessionId, transport);
          
          try {
            // Connect to MCP server
            await this.mcpServer.connect(transport);
          } catch (connectionError) {
            // Clean up on connection failure
            this.transports.delete(responseSessionId);
            
            const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
            res.status(500).json({
              jsonrpc: "2.0",
              error: { 
                code: -32603, 
                message: "MCP server connection failed",
                data: { reason: errorMessage }
              },
              id: (req.body as any)?.id || null
            });
            return;
          }
        } else {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32600, message: "Missing session ID" },
            id: (req.body as any)?.id || null
          });
          return;
        }

        // Set session ID header before handling request
        if (responseSessionId) {
          res.setHeader('Mcp-Session-Id', responseSessionId);
        }

        // Handle the request using transport
        await transport.handleRequest(req, res, req.body);
      } catch (handlingError) {
        const errorMessage = handlingError instanceof Error ? handlingError.message : String(handlingError);
        res.status(500).json({
          jsonrpc: "2.0",
          error: { 
            code: -32603, 
            message: "Request handling failed",
            data: { reason: errorMessage }
          },
          id: (req.body as any)?.id || null
        });
      }
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
