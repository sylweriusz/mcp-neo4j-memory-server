/**
 * Debug response structure
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { SimpleHTTPServer } from '../../src/http/server';

describe('HTTP Response Structure Debug', () => {
  let server: SimpleHTTPServer;
  const TEST_PORT = 3004;

  beforeAll(async () => {
    server = new SimpleHTTPServer();
    await server.start(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should debug initialize response structure', async () => {
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
      });

    console.log('📊 Initialize Response:');
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    console.log('Text:', response.text);

    expect(response.status).toBe(200);
  });

  it('should debug tools/list response structure', async () => {
    // First initialize
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
      });

    const sessionId = initResponse.headers['mcp-session-id'];
    console.log('🔑 Session ID:', sessionId);

    // Then list tools
    const toolsResponse = await request(`http://localhost:${TEST_PORT}`)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Mcp-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2
      });

    console.log('🔧 Tools Response:');
    console.log('Status:', toolsResponse.status);
    console.log('Headers:', toolsResponse.headers);
    console.log('Body:', JSON.stringify(toolsResponse.body, null, 2));
    console.log('Text:', toolsResponse.text);

    expect(toolsResponse.status).toBe(200);
  });
});
