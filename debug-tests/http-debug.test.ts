/**
 * Debug HTTP Server Test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { SimpleHTTPServer } from '../src/http/server';

const DEBUG_PORT = 3001;

describe('HTTP Server Debug', () => {
  let server: SimpleHTTPServer;

  beforeAll(async () => {
    server = new SimpleHTTPServer();
    await server.start(DEBUG_PORT);
  });

  afterAll(async () => {
    // No cleanup method available
  });

  it('should debug initialize request', async () => {
    console.log('Testing initialize request...');
    
    const response = await request(`http://localhost:${DEBUG_PORT}`)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        },
        id: 1
      });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    console.log('Response body:', response.body);
    console.log('Response text:', response.text);

    // Let's see what we actually get
    expect(true).toBe(true);
  });
});
