/**
 * HTTP Server E2E Tests
 * Tests the actual HTTP server implementation for production scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { SimpleHTTPServer } from '../../src/http/server';

describe('HTTP Server E2E - Production Integration', () => {
  let server: SimpleHTTPServer;
  let serverInstance: any;
  const TEST_PORT = 3001; // Different from default to avoid conflicts

  beforeAll(async () => {
    server = new SimpleHTTPServer();
    
    // Start server on test port
    serverInstance = await server.start(TEST_PORT);
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.close();
    }
  });

  describe('Health Check Endpoint', () => {
    it('should respond to health check requests', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        sessions: 0,
        transport: 'streamable-http'
      });
    });
  });

  describe('CORS Support', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .options('/mcp')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toBe('GET, POST, DELETE, OPTIONS');
      expect(response.headers['access-control-allow-headers']).toBe('Content-Type, Accept, Mcp-Session-Id');
    });

    it('should include CORS headers in all responses', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/mcp')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('MCP Endpoint Status', () => {
    it('should respond to GET requests with endpoint information', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/mcp')
        .expect(200);

      expect(response.body).toEqual({
        status: 'MCP endpoint ready',
        protocol: 'streamable-http',
        endpoints: {
          health: '/health',
          mcp: '/mcp'
        },
        message: 'Use POST for MCP communication'
      });
    });
  });

  describe('Session Management', () => {
    it('should handle missing session ID for non-initialize requests', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1
        })
        .expect(400);

      expect(response.body.error.code).toBe(-32600);
      expect(response.body.error.message).toBe('Missing session ID');
    });

    it('should create session for initialize requests', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          },
          id: 1
        })
        .expect(200);

      expect(response.headers['mcp-session-id']).toBeDefined();
      
      // Parse SSE response data
      const data = response.text.split('data: ')[1];
      const jsonResponse = JSON.parse(data.trim());
      expect(jsonResponse.jsonrpc).toBe('2.0');
    });

    it('should terminate sessions via DELETE', async () => {
      // First create a session
      const initResponse = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          },
          id: 1
        })
        .expect(200);

      const sessionId = initResponse.headers['mcp-session-id'];

      // Then terminate it
      await request(`http://localhost:${TEST_PORT}`)
        .delete('/mcp')
        .set('Mcp-Session-Id', sessionId)
        .expect(204);

      // Verify session is gone
      await request(`http://localhost:${TEST_PORT}`)
        .delete('/mcp')
        .set('Mcp-Session-Id', sessionId)
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .send('invalid json')
        .expect(400);

      // Should get an error response for malformed JSON
      expect(response.body.error).toBeDefined();
    });

    it('should handle unknown endpoints', async () => {
      await request(`http://localhost:${TEST_PORT}`)
        .get('/unknown')
        .expect(404);
    });
  });

  describe('MCP Tool Integration', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create session for tool tests
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          },
          id: 1
        })
        .expect(200);

      sessionId = response.headers['mcp-session-id'];
    });

    it('should list available tools', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 2
        })
        .expect(200);

      // HTTP server uses Server-Sent Events format
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.text).toContain('event: message');
      expect(response.text).toContain('data: ');
      
      // Parse the SSE data to get the JSON
      const dataLine = response.text.split('\n').find(line => line.startsWith('data: '));
      expect(dataLine).toBeDefined();
      
      const jsonData = JSON.parse(dataLine!.replace('data: ', ''));
      expect(jsonData.result.tools).toBeDefined();
      expect(jsonData.result.tools.length).toBeGreaterThan(0);
      
      // Check for our unified tools
      const toolNames = jsonData.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('memory_store');
      expect(toolNames).toContain('memory_find');
      expect(toolNames).toContain('memory_modify');
      expect(toolNames).toContain('database_switch');
    });

    it('should handle tool execution', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'database_switch',
            arguments: {
              databaseName: 'test-http-db'
            }
          },
          id: 3
        })
        .expect(200);

      // HTTP server uses Server-Sent Events format for tool responses
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.text).toContain('event: message');
      expect(response.text).toContain('data: ');
      
      // Parse the SSE data to get the JSON
      const dataLine = response.text.split('\n').find(line => line.startsWith('data: '));
      expect(dataLine).toBeDefined();
      
      const jsonData = JSON.parse(dataLine!.replace('data: ', ''));
      expect(jsonData.result).toBeDefined();
      expect(jsonData.result.content).toBeDefined();
      expect(jsonData.result.content[0].type).toBe('text');
    });
  });
});
