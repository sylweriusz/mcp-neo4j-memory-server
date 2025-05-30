/**
 * MCP Memory Handler E2E Tests
 * Tests the complete MCP workflow from handler to database
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpMemoryHandler } from '../../src/application/mcp-handlers/mcp-memory-handler';
import { DIContainer } from '../../src/container/di-container';

describe('MCP Memory Handler E2E', () => {
  let handler: McpMemoryHandler;
  let container: DIContainer;
  let testMemoryIds: string[] = [];

  beforeEach(async () => {
    container = DIContainer.getInstance();
    await container.initializeDatabase();
    
    handler = new McpMemoryHandler();
    testMemoryIds = [];
  });

  afterEach(async () => {
    // Cleanup test memories
    if (testMemoryIds.length > 0) {
      try {
        await handler.handleMemoryManage({
          operation: 'delete',
          identifiers: testMemoryIds
        });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('memory_manage create', () => {
    it('should create memory through MCP interface', async () => {
      const memoryData = {
        name: 'E2E Test Memory',
        memoryType: 'project',
        metadata: { test: true },
        observations: ['Test observation 1', 'Test observation 2'],
        tags: ['e2e', 'test']
      };

      const result = await handler.handleMemoryManage({
        operation: 'create',
        memories: [memoryData]
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('created');
      expect(result.results[0].id).toBeDefined();
      testMemoryIds.push(result.results[0].id);
    });
  });
});
