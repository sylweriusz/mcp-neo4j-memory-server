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
import {
  UnifiedMemoryStoreHandler,
  UnifiedMemoryFindHandler,
  UnifiedMemoryModifyHandler
} from "../application/unified-handlers";
import {
  MCPValidationError,
  MCPDatabaseError,
  MCPServiceError,
  isMCPError,
  toMCPError
} from "../infrastructure/errors";

/**
 * Create and configure MCP server with tools
 * Based on index.ts - exact same functionality
 */
function createMCPServer(): McpServer {
  const server = new McpServer({
    name: "neo4j-memory-server",
    version: "3.1.0"
  });

  // Lazy handler factory - safe for tool scanning
  let handlerPromise: Promise<any> | null = null;
  const getHandlers = async () => {
    if (!handlerPromise) {
      handlerPromise = (async () => {
        // Initialize existing handlers
        const memoryHandler = new McpMemoryHandler();
        const observationHandler = new McpObservationHandler();
        const relationHandler = new McpRelationHandler();
        const databaseHandler = new McpDatabaseHandler();
        
        // Initialize unified handlers
        const unifiedStoreHandler = new UnifiedMemoryStoreHandler(memoryHandler, relationHandler);
        const unifiedFindHandler = new UnifiedMemoryFindHandler(memoryHandler);
        const unifiedModifyHandler = new UnifiedMemoryModifyHandler(
          memoryHandler, 
          observationHandler, 
          relationHandler
        );
        
        // Only initialize database if we have connection config
        const hasDbConfig = process.env.NEO4J_URI || process.env.NEO4J_USERNAME;
        if (hasDbConfig) {
          const { DIContainer } = await import("../container/di-container");
          const container = DIContainer.getInstance();
          await container.initializeDatabase();
        }
        
        return { 
          databaseHandler,
          unifiedStoreHandler,
          unifiedFindHandler,
          unifiedModifyHandler
        };
      })();
    }
    return handlerPromise;
  };

  // =============================================================================
  // UNIFIED TOOLS IMPLEMENTATION (Exactly 4 tools as specified)
  // =============================================================================

  // Tool 1: memory_store
  server.tool(
    "memory_store",
    "Creates new memories with observations and establishes relationships in one atomic operation. Use 'localId' for cross-references within THIS request only. Metadata = classification, observations = content. Include language in metadata. **Always search before creating to avoid duplicates.**",
    {
      memories: z.array(z.object({
        name: z.string().describe("Human-readable memory name. Make it descriptive and searchable."),
        memoryType: z.string().describe("Memory classification (e.g., knowledge, decision, pattern, implementation, architecture)"),
        localId: z.string().optional().describe("Temporary reference ID valid ONLY within this request. Use for relations between new memories."),
        observations: z.array(z.string()).describe("Content fragments. **One session = one observation.** Don't over-fragment. Add what you learned NOW."),
        metadata: z.record(z.any()).optional().describe("Classification data. Include: language, project, status, tags, dates, etc.")
      })).describe("Array of memories to create. Check if similar memories exist first."),
      relations: z.array(z.object({
        from: z.string().describe("Source localId or existing memoryId"),
        to: z.string().describe("Target localId or existing memoryId"),
        type: z.string().describe("Relationship type: INFLUENCES, DEPENDS_ON, EXTENDS, IMPLEMENTS, CONTAINS, etc."),
        strength: z.number().min(0.0).max(1.0).optional().describe("0.0-1.0, defaults to 0.5"),
        source: z.enum(['agent', 'user', 'system']).optional().describe("defaults to 'agent'")
      })).optional().describe("Relationships to create between memories."),
      options: z.object({
        validateReferences: z.boolean().optional().describe("Check all target IDs exist (default: true)"),
        allowDuplicateRelations: z.boolean().optional().describe("Skip/error on duplicates (default: false)"),
        transactional: z.boolean().optional().describe("All-or-nothing behavior (default: true)"),
        maxMemories: z.number().optional().describe("Batch size limit (default: 50)"),
        maxRelations: z.number().optional().describe("Relations limit (default: 200)")
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
    "Finds existing memories using semantic search, IDs, or filters. Use '*' for all memories. **Search before creating new memories.** Context levels: 'minimal' for lists, 'full' for complete data, 'relations-only' for graph analysis. Updates access timestamps.",
    {
      query: z.union([z.string(), z.array(z.string())]).describe("Search query (semantic), '*' for all memories, or array of specific IDs to retrieve"),
      limit: z.number().optional().describe("Maximum results to return. Default: 10, use higher for comprehensive searches"),
      memoryTypes: z.array(z.string()).optional().describe("Filter by types (e.g., ['knowledge', 'decision']). Leave empty for all types."),
      includeContext: z.enum(["minimal", "full", "relations-only"]).optional().describe("Detail level: 'minimal' (id/name/type only), 'full' (everything), 'relations-only' (graph data)"),
      threshold: z.number().min(0.0).max(1.0).optional().describe("Minimum semantic match score (0.0-1.0). Lower = more results. Default: 0.1"),
      orderBy: z.enum(["relevance", "created", "modified", "accessed"]).optional().describe("Sort order (default: 'relevance')"),
      
      // Date-based filtering
      createdAfter: z.string().optional().describe("ISO date or relative ('7d', '30d', '3m', '1y')"),
      createdBefore: z.string().optional().describe("ISO date or relative"),
      modifiedSince: z.string().optional().describe("ISO date or relative"),
      accessedSince: z.string().optional().describe("ISO date or relative"),
      
      // Graph traversal
      traverseFrom: z.string().optional().describe("Starting memory ID for graph traversal"),
      traverseRelations: z.array(z.string()).optional().describe("Relation types to follow ['INFLUENCES', 'DEPENDS_ON']"),
      maxDepth: z.number().min(1).max(5).optional().describe("Maximum traversal depth (1-5, default: 2)"),
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
    "Modifies existing memories: update properties, manage observations, handle relationships. Use for adding to existing memories. **One session = one observation.** All operations are transactional (all-or-nothing).",
    {
      operation: z.enum([
        "update", "delete", "batch-delete",
        "add-observations", "delete-observations", 
        "create-relations", "update-relations", "delete-relations"
      ]).describe("What to do: update, delete, add-observations (common), create-relations, etc."),
      target: z.string().optional().describe("Single memory ID to modify. Use 'targets' for batch operations."),
      targets: z.array(z.string()).optional().describe("Multiple IDs for batch operations"),
      changes: z.object({
        name: z.string().optional().describe("New memory name"),
        memoryType: z.string().optional().describe("New memory type"),
        metadata: z.record(z.any()).optional().describe("New metadata (replaces existing)")
      }).optional().describe("For update operations"),
      observations: z.array(z.object({
        memoryId: z.string().describe("Target memory ID"),
        contents: z.array(z.string()).describe("For add: observation text(s). For delete: observation IDs. Don't over-fragment when adding.")
      })).optional().describe("Observations to add/delete. **Add what you learned in THIS session as ONE observation.**"),
      relations: z.array(z.object({
        from: z.string().describe("Source memory ID"),
        to: z.string().describe("Target memory ID"),
        type: z.string().describe("Relationship type: INFLUENCES, DEPENDS_ON, EXTENDS, IMPLEMENTS, CONTAINS, etc."),
        strength: z.number().min(0.0).max(1.0).optional().describe("For create/update operations (0.0-1.0)"),
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
    "Switches active database for ALL subsequent operations. **Use when: starting work on specific project, switching contexts, or if operations report wrong database.** Creates database if needed. This is a session-level change.",
    {
      databaseName: z.string().describe("Target database name. Will be created if it doesn't exist. All future operations use this database.")
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
