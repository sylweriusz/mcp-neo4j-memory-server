/**
 * Unified Memory Find Handler
 * Single responsibility: Route between search, retrieve, and graph traversal based on query type
 * THE IMPLEMENTOR'S RULE: One tool, multiple pathways - no feature bloat
 */

import { McpMemoryHandler } from '../mcp-handlers';
import { DIContainer } from '../../container/di-container';
import { 
  ContextLevelProcessor,
  DateFilterProcessor,
  GraphTraversalProcessor,
  type ContextLevel,
  type DateFilterOptions,
  type GraphTraversalOptions
} from './services';

export interface MemoryFindRequest {
  query: string | string[];
  limit?: number;
  memoryTypes?: string[];
  includeContext?: ContextLevel;
  threshold?: number;
  orderBy?: "relevance" | "created" | "modified" | "accessed";
  
  // Date-based filtering
  createdAfter?: string;
  createdBefore?: string;
  modifiedSince?: string;
  accessedSince?: string;
  
  // Graph traversal
  traverseFrom?: string;
  traverseRelations?: string[];
  maxDepth?: number;
  traverseDirection?: "outbound" | "inbound" | "both";
}

export interface MemoryFindResponse {
  memories: any[];
  _meta: {
    database: string;
    total: number;
    query: string | string[];
    queryTime: number;
    contextLevel: ContextLevel;
  };
}

export class UnifiedMemoryFindHandler {
  private memoryHandler: McpMemoryHandler;
  private contextProcessor: ContextLevelProcessor;
  private dateProcessor: DateFilterProcessor;
  private graphProcessor: GraphTraversalProcessor;

  constructor(memoryHandler: McpMemoryHandler) {
    this.memoryHandler = memoryHandler;
    this.contextProcessor = new ContextLevelProcessor();
    this.dateProcessor = new DateFilterProcessor();
    this.graphProcessor = new GraphTraversalProcessor();
  }

  async handleMemoryFind(request: MemoryFindRequest): Promise<MemoryFindResponse> {
    const startTime = Date.now();
    
    try {
      // Validate and process request
      this.validateFindRequest(request);
      const contextLevel = request.includeContext || "full";
      
      let result: any;
      
      // Route based on operation type
      if (request.traverseFrom) {
        // Graph traversal operation
        result = await this.handleGraphTraversal(request);
      } else if (Array.isArray(request.query) || this.isStringifiedArray(request.query)) {
        // Direct ID retrieval (handle both actual arrays and stringified arrays from MCP transport)
        result = await this.handleDirectRetrieval(request);
      } else {
        // Search operation (with potential date filtering)
        result = await this.handleSearch(request);
      }
      
      // Apply context level filtering
      const processedMemories = this.contextProcessor.applyContextLevel(
        result.memories || [],
        contextLevel
      );
      
      const currentDb = DIContainer.getInstance().getCurrentDatabase();
      
      return {
        memories: processedMemories,
        _meta: {
          database: currentDb.database,
          total: processedMemories.length,
          query: request.query,
          queryTime: Date.now() - startTime,
          contextLevel
        }
      };
      
    } catch (error) {
      throw new Error(`Memory find failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle graph traversal operation
   */
  private async handleGraphTraversal(request: MemoryFindRequest): Promise<any> {
    if (!request.traverseFrom) {
      throw new Error('traverseFrom is required for graph traversal');
    }

    const traversalOptions: GraphTraversalOptions = {
      traverseFrom: request.traverseFrom,
      traverseRelations: request.traverseRelations,
      maxDepth: request.maxDepth,
      traverseDirection: request.traverseDirection
    };

    // Process traversal options to get the proper Cypher query
    const processed = this.graphProcessor.processTraversal(traversalOptions);
    
    // Execute the traversal query directly through session
    const container = DIContainer.getInstance();
    const sessionFactory = container.getSessionFactory();
    const session = sessionFactory.createSession();
    
    try {
      const result = await session.run(processed.cypher, processed.params);
      
      // Convert results to traversal format
      const traversalResults = this.graphProcessor.processTraversalResults(
        result.records.map(record => ({
          id: record.get('id'),
          name: record.get('name'),
          type: record.get('type'),
          distance: record.get('distance'),
          relation: record.get('relation'),
          strength: record.get('strength'),
          source: record.get('source'),
          createdAt: record.get('createdAt')
        }))
      );
      
      // Extract traversal result IDs for enrichment
      const foundIds = traversalResults.map(tr => tr.id);
      
      if (foundIds.length === 0) {
        return { memories: [] };
      }
      
      // Get full memory data for traversal results
      const enrichedMemories = await this.memoryHandler.handleMemoryRetrieve(foundIds);
      
      // Build proper traversal response with relationship context
      const memories = enrichedMemories.memories.map((memory: any) => {
        const traversalData = traversalResults.find(tr => tr.id === memory.id);
        
        if (!traversalData) {
          return memory; // Fallback to basic memory data
        }
        
        // Build proper relationship context based on traversal direction
        const relationshipContext = this.buildTraversalRelationshipContext(
          request.traverseFrom!,
          request.traverseDirection || 'both',
          traversalData
        );
        
        return {
          ...memory,
          related: relationshipContext
        };
      });
      
      return { memories };
      
    } finally {
      await session.close();
    }
  }

  /**
   * Build proper relationship context for traversal results
   * THE IMPLEMENTOR'S RULE: Direction matters - ancestors vs descendants vs both
   */
  private buildTraversalRelationshipContext(
    startingMemoryId: string,
    direction: string,
    traversalData: any
  ): any {
    const relationshipEntry = {
      id: startingMemoryId,
      name: startingMemoryId, // Use ID as identifier
      type: "starting_point",
      relation: traversalData.relation,
      distance: traversalData.distance,
      strength: traversalData.strength,
      source: traversalData.source,
      createdAt: traversalData.createdAt
    };

    switch (direction) {
      case 'outbound':
        // When traversing outbound, we found descendants of the starting memory
        return {
          ancestors: [relationshipEntry]
        };
      case 'inbound':
        // When traversing inbound, we found ancestors of the starting memory
        return {
          descendants: [relationshipEntry]
        };
      case 'both':
      default:
        // For bidirectional, we need to determine based on the relationship direction
        // This is a simplified approach - could be enhanced to show actual direction
        return {
          related: [relationshipEntry]
        };
    }
  }

  /**
   * Handle direct ID retrieval
   */
  private async handleDirectRetrieval(request: MemoryFindRequest): Promise<any> {
    // Parse the query array (handle both real arrays and stringified arrays from MCP)
    const idsToRetrieve = this.parseQueryArray(request.query as string | string[]);

    // Filter by memory types if specified
    if (request.memoryTypes && request.memoryTypes.length > 0) {
      // Note: Could be optimized with pre-filtering at query level
    }

    const result = await this.memoryHandler.handleMemoryRetrieve(idsToRetrieve);
    
    // Apply memory type filtering if specified
    if (request.memoryTypes && request.memoryTypes.length > 0) {
      result.memories = result.memories.filter((memory: any) => 
        request.memoryTypes!.includes(memory.memoryType)
      );
    }

    return result;
  }

  /**
   * Handle search operation with date filtering
   */
  private async handleSearch(request: MemoryFindRequest): Promise<any> {
    if (typeof request.query !== 'string') {
      throw new Error('Query must be string for search operation');
    }

    // Process date filters if provided
    const dateFilters = this.extractDateFilters(request);
    if (Object.keys(dateFilters).length > 0) {
      this.dateProcessor.validateDateFilters(dateFilters);
      // Note: Date filtering integration pending - delegates to existing search for now
    }

    // Delegate to existing search handler
    const result = await this.memoryHandler.handleMemorySearch(
      request.query,
      request.limit || 10,
      request.includeContext !== "minimal", // includeGraphContext
      request.memoryTypes,
      request.threshold || 0.1
    );

    return result;
  }

  /**
   * Extract date filter options from request
   */
  private extractDateFilters(request: MemoryFindRequest): DateFilterOptions {
    return {
      createdAfter: request.createdAfter,
      createdBefore: request.createdBefore,
      modifiedSince: request.modifiedSince,
      accessedSince: request.accessedSince
    };
  }

  /**
   * Detect stringified arrays from MCP transport layer
   * MCP serializes arrays as strings like '["id1","id2"]'
   */
  private isStringifiedArray(query: any): boolean {
    if (typeof query !== 'string') return false;
    
    // Check if it starts with [ and ends with ]
    if (!query.startsWith('[') || !query.endsWith(']')) return false;
    
    try {
      const parsed = JSON.parse(query);
      return Array.isArray(parsed) && parsed.every(item => typeof item === 'string');
    } catch {
      return false;
    }
  }

  /**
   * Parse stringified array or return original array
   */
  private parseQueryArray(query: string | string[]): string[] {
    if (Array.isArray(query)) return query;
    
    if (typeof query === 'string' && this.isStringifiedArray(query)) {
      try {
        return JSON.parse(query);
      } catch {
        return [query]; // Fallback to single string if parsing fails
      }
    }
    
    return [query]; // Single string query
  }
  private validateFindRequest(request: MemoryFindRequest): void {
    if (!request.query) {
      throw new Error('query parameter is required');
    }

    if (request.limit !== undefined && request.limit <= 0) {
      throw new Error('limit must be positive');
    }

    if (request.threshold !== undefined && (request.threshold < 0 || request.threshold > 1)) {
      throw new Error('threshold must be between 0.0 and 1.0');
    }

    // Validate context level
    if (request.includeContext) {
      this.contextProcessor.validateContextLevel(request.includeContext);
    }

    // Validate order by
    const validOrderBy = ["relevance", "created", "modified", "accessed"];
    if (request.orderBy && !validOrderBy.includes(request.orderBy)) {
      throw new Error(`Invalid orderBy: ${request.orderBy}. Valid options: ${validOrderBy.join(', ')}`);
    }

    // Validate graph traversal parameters
    if (request.traverseFrom || request.traverseRelations || request.maxDepth || request.traverseDirection) {
      if (!request.traverseFrom) {
        throw new Error('traverseFrom is required when using graph traversal parameters');
      }
    }
  }
}
