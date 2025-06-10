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
  type ProcessedDateFilter,
  type GraphTraversalOptions
} from './services';
import { WildcardSearchService } from '../../infrastructure/services/search/wildcard-search-service';
import { 
  MCPValidationError, 
  MCPServiceError,
  MCPErrorCodes 
} from '../../infrastructure/errors';

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
      // Detect specific error types
      if (error instanceof Error && error.message.includes('Invalid context level')) {
        throw new MCPValidationError(
          error.message,
          MCPErrorCodes.INVALID_CONTEXT_LEVEL
        );
      }
      
      throw new MCPServiceError(
        `Memory find failed: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.SERVICE_UNAVAILABLE,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Handle graph traversal operation
   */
  private async handleGraphTraversal(request: MemoryFindRequest): Promise<any> {
    if (!request.traverseFrom) {
      throw new MCPValidationError(
        'traverseFrom is required for graph traversal',
        MCPErrorCodes.VALIDATION_FAILED
      );
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
      throw new MCPValidationError(
        'Query must be string for search operation',
        MCPErrorCodes.INVALID_QUERY,
        { queryType: typeof request.query }
      );
    }

    // Process date filters if provided
    const dateFilters = this.extractDateFilters(request);
    let processedDateFilter = { cypher: '', params: {} };
    
    if (Object.keys(dateFilters).length > 0) {
      this.dateProcessor.validateDateFilters(dateFilters);
      processedDateFilter = this.dateProcessor.processDateFilters(dateFilters);
    }

    // Execute wildcard search with date filtering
    if (request.query === '*') {
      return await this.executeWildcardSearchWithDateFilters(
        request.limit || 10,
        request.includeContext !== "minimal",
        request.memoryTypes,
        processedDateFilter
      );
    }

    // For non-wildcard queries, delegate to existing search handler
    // TODO: Implement date filtering for semantic search
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
   * Execute wildcard search with date filters
   * Direct integration bypassing complex delegation chain
   */
  private async executeWildcardSearchWithDateFilters(
    limit: number,
    includeGraphContext: boolean,
    memoryTypes?: string[],
    dateFilter?: ProcessedDateFilter
  ): Promise<any> {
    // Get container and session factory directly
    const container = (this.memoryHandler as any).container;
    
    // Ensure database is initialized through container
    await container.initializeDatabase();
    
    const sessionFactory = container.getSessionFactory();
    const session = sessionFactory.createSession();
    
    try {
      const wildcardService = new WildcardSearchService(session);
      
      const results = await wildcardService.search(
        limit,
        includeGraphContext,
        memoryTypes,
        dateFilter?.cypher,
        dateFilter?.params
      );

      return {
        memories: results.map((result: any) => ({
          id: result.id,
          name: result.name,
          memoryType: result.type,
          observations: result.observations,
          metadata: result.metadata,
          createdAt: result.createdAt,
          modifiedAt: result.modifiedAt,
          lastAccessed: result.lastAccessed,
          score: result.score,
          related: result.related
        })),
        _meta: {
          database: container.getCurrentDatabase(),
          total: results.length,
          query: "*",
          queryTime: 0, // Will be updated by actual execution
          contextLevel: includeGraphContext ? "full" : "minimal"
        }
      };
    } finally {
      await session.close();
    }
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
      throw new MCPValidationError(
        'query parameter is required',
        MCPErrorCodes.VALIDATION_FAILED
      );
    }

    if (request.limit !== undefined && request.limit <= 0) {
      throw new MCPValidationError(
        'limit must be positive',
        MCPErrorCodes.INVALID_PARAMS,
        { limit: request.limit }
      );
    }

    if (request.threshold !== undefined && (request.threshold < 0 || request.threshold > 1)) {
      throw new MCPValidationError(
        'threshold must be between 0.0 and 1.0',
        MCPErrorCodes.VALIDATION_FAILED,
        { threshold: request.threshold }
      );
    }

    // Validate context level
    if (request.includeContext) {
      this.contextProcessor.validateContextLevel(request.includeContext);
    }

    // Validate order by
    const validOrderBy = ["relevance", "created", "modified", "accessed"];
    if (request.orderBy && !validOrderBy.includes(request.orderBy)) {
      throw new MCPValidationError(
        `Invalid orderBy: ${request.orderBy}. Valid options: ${validOrderBy.join(', ')}`,
        MCPErrorCodes.VALIDATION_FAILED,
        { providedOrderBy: request.orderBy, validOptions: validOrderBy }
      );
    }

    // Validate graph traversal parameters
    if (request.traverseFrom || request.traverseRelations || request.maxDepth || request.traverseDirection) {
      if (!request.traverseFrom) {
        throw new MCPValidationError(
          'traverseFrom is required when using graph traversal parameters',
          MCPErrorCodes.INVALID_TRAVERSAL_OPTIONS
        );
      }
    }
  }
}
