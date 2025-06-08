/**
 * Debug 500 Error in Initialize
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { SimpleHTTPServer } from '../../src/http/server';

describe('HTTP 500 Error Debug', () => {
  let server: SimpleHTTPServer;
  const TEST_PORT = 3003;

  beforeAll(async () => {
    server = new SimpleHTTPServer();
    await server.start(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should debug 500 error in initialize', async () => {
    const testPayload = {
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
    };

    try {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/mcp')
        .send(testPayload);

      console.log('📊 Response details:');
      console.log('Status:', response.status);
      console.log('Headers:', response.headers);
      console.log('Body:', response.body);
      console.log('Text:', response.text);

      const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js');
      console.log('🔍 isInitializeRequest result:', isInitializeRequest(testPayload));

      expect(response.status).toBeGreaterThan(0);
    } catch (error) {
      console.error('💥 Request failed:', error);
      throw error;
    }
  });
});
