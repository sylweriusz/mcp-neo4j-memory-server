declare module '@modelcontextprotocol/sdk/server' {
  export class McpServer {
    constructor(config: { name: string; version: string });
    connect(transport: any): Promise<void>;
    tool(toolName: string): any;
    getHandlers(): Promise<{
      memoryHandler: any;
      observationHandler: any;
      relationHandler: any;
      databaseHandler: any;
    }>;
    name: string;
    version: string;
    tools: { [key: string]: any };
    handlers: {
      memoryHandler: any;
      observationHandler: any;
      relationHandler: any;
      databaseHandler: any;
    } | null;
  }

  export class StdioServerTransport {}
}
}
