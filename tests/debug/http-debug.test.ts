/**
 * HTTP Debug Test - Simple Debug for MCP Initialize
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { SimpleHTTPServer } from '../../src/http/server';

describe('HTTP Server Debug Test', () => {
  let server: SimpleHTTPServer;
  const TEST_PORT = 3002;

  beforeAll(async () => {
    server = new SimpleHTTPServer();
    await server.start(TEST_PORT);
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should debug what happens during initialize', async () => {
    const testPayload = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {}
      },
      id: 1
    };

    console.log('🔍 Sending initialize request:', JSON.stringify(testPayload, null, 2));

    const response = await request(`http://localhost:${TEST_PORT}`)
      .post('/mcp')
      .send(testPayload);

    console.log('📊 Response details:');
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Body:', response.body);
    console.log('Text:', response.text);

    // Log what isInitializeRequest would return
    const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js');
    console.log('🔍 isInitializeRequest result:', isInitializeRequest(testPayload));

    // For now, just check that we get some response
    expect(response.status).toBeGreaterThan(0);
  });

  it('should test GET endpoint', async () => {
    const response = await request(`http://localhost:${TEST_PORT}`)
      .get('/mcp');

    console.log('📊 GET Response:');
    console.log('Status:', response.status);
    console.log('Body:', response.body);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('MCP endpoint ready');
  });
});
