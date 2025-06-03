import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpMemoryHandler, McpObservationHandler, McpRelationHandler, McpDatabaseHandler } from "../../src/application/mcp-handlers";

describe('MCP Server Initialization', () => {
  let server: McpServer;
  let transport: StdioServerTransport;

  beforeEach(() => {
    server = new McpServer({
      name: "neo4j-memory-server",
      version: "2.3.1"
    });
    transport = new StdioServerTransport();
  });

  it('should initialize the server without throwing errors', () => {
    expect(() => server).not.toThrow();
  });

  it('should create handler instances without errors', () => {
    expect(() => new McpMemoryHandler()).not.toThrow();
    expect(() => new McpObservationHandler()).not.toThrow();
    expect(() => new McpRelationHandler()).not.toThrow();
    expect(() => new McpDatabaseHandler()).not.toThrow();
  });

  it('should create transport without errors', () => {
    expect(() => new StdioServerTransport()).not.toThrow();
  });
});
