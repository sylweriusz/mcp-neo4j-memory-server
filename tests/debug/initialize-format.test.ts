/**
 * Test Different Initialize Request Formats
 */
import { describe, it, expect } from 'vitest';

describe('MCP Initialize Request Format Debug', () => {
  it('should test different initialize request formats', async () => {
    const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js');

    // Test 1: Basic format
    const basic = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {}
      },
      id: 1
    };
    console.log('Basic format:', isInitializeRequest(basic));

    // Test 2: Different protocol version
    const diffVersion = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-10-07',
        capabilities: {}
      },
      id: 1
    };
    console.log('Different version:', isInitializeRequest(diffVersion));

    // Test 3: With clientInfo
    const withClientInfo = {
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
    console.log('With clientInfo:', isInitializeRequest(withClientInfo));

    // Test 4: Without id
    const withoutId = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {}
      }
    };
    console.log('Without id:', isInitializeRequest(withoutId));

    // Test 5: Minimal
    const minimal = {
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {}
      }
    };
    console.log('Minimal:', isInitializeRequest(minimal));

    expect(true).toBe(true);
  });
});
