import { SimpleHTTPServer } from '../src/http/server.ts';

const DEBUG_PORT = 3001;

async function testSimpleHTTP() {
  const server = new SimpleHTTPServer();
  
  try {
    console.log('Starting HTTP server...');
    await server.start(DEBUG_PORT);
    console.log(`Server started on port ${DEBUG_PORT}`);
    
    // Test initialize request
    const response = await fetch(`http://localhost:${DEBUG_PORT}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        },
        id: 1
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response body:', await response.text());
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  process.exit(0);
}

testSimpleHTTP();
