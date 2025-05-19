import { describe, it, expect, vi } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock the McpServer and other dependencies
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    // Mock transport methods
  }))
}));

vi.mock('../src/manager', () => ({
  Neo4jKnowledgeGraphManager: vi.fn().mockImplementation(() => ({
    createMemories: vi.fn().mockResolvedValue([{ id: 'test123' }]),
    createRelations: vi.fn().mockResolvedValue(true),
    addObservations: vi.fn().mockResolvedValue(true),
    deleteMemories: vi.fn().mockResolvedValue(true),
    deleteObservations: vi.fn().mockResolvedValue(true),
    deleteRelations: vi.fn().mockResolvedValue(true),
    searchMemories: vi.fn().mockResolvedValue([]),
    searchMemoriesByTags: vi.fn().mockResolvedValue([]),
    retrieveMemories: vi.fn().mockResolvedValue([]),
    getMemorySummaries: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../src/database_manager', () => ({
  DatabaseManager: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../src/logger', () => ({
  NullLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }))
}));

vi.mock('../src/database_tools', () => ({
  addDatabaseTools: vi.fn()
}));

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  }
}));

describe('Main Server', () => {
  it('creates an MCP server with tools', async () => {
    // Import index file which sets up the server
    const indexModule = await import('../src/index');
    
    // Verify McpServer was instantiated
    expect(McpServer).toHaveBeenCalled();
    
    // Get the mock instance
    const mockServer = McpServer.mock.results[0].value;
    
    // Verify tools were registered
    expect(mockServer.tool).toHaveBeenCalled();
    // Specific count not important, just that tools were registered
    
    // Check for specific tool registrations - using consolidated tool names
    expect(mockServer.tool).toHaveBeenCalledWith(
      'memory_manage',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
    
    expect(mockServer.tool).toHaveBeenCalledWith(
      'memory_search',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
  });
});