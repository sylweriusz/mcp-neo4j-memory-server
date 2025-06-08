/**
 * Graph Traversal Processor
 * Single responsibility: Navigate relationship networks with configurable depth and filtering
 * THE IMPLEMENTOR'S RULE: Graph exploration without the bloat
 */

import { getLimitsConfig } from '../../../config';

export interface GraphTraversalOptions {
  traverseFrom: string;
  traverseRelations?: string[];
  maxDepth?: number;
  traverseDirection?: "outbound" | "inbound" | "both";
}

export interface TraversalResult {
  id: string;
  name: string;
  type: string;
  distance: number;
  relation: string;
  strength?: number;
  source?: string;
  createdAt?: string;
}

export interface ProcessedTraversal {
  cypher: string;
  params: Record<string, any>;
}

export class GraphTraversalProcessor {
  
  /**
   * Process graph traversal into Cypher query
   * Zero-fallback: Invalid parameters throw errors immediately
   */
  processTraversal(options: GraphTraversalOptions): ProcessedTraversal {
    this.validateTraversalOptions(options);
    
    const limits = getLimitsConfig();
    const maxDepth = Math.min(options.maxDepth || 2, limits.maxTraversalDepth);
    const direction = options.traverseDirection || "both";
    const relationTypes = options.traverseRelations;
    
    let cypher: string;
    const params: Record<string, any> = {
      startId: options.traverseFrom,
      maxDepth
    };
    
    if (relationTypes && relationTypes.length > 0) {
      params.relationTypes = relationTypes;
    }
    
    switch (direction) {
      case "outbound":
        cypher = this.buildOutboundTraversal(maxDepth, relationTypes);
        break;
      case "inbound":
        cypher = this.buildInboundTraversal(maxDepth, relationTypes);
        break;
      case "both":
      default:
        cypher = this.buildBidirectionalTraversal(maxDepth, relationTypes);
        break;
    }
    
    return { cypher, params };
  }

  /**
   * Build outbound traversal query (what this memory influences)
   */
  private buildOutboundTraversal(maxDepth: number, relationTypes?: string[]): string {
    const relationFilter = relationTypes 
      ? `ALL(rel IN relationships(path) WHERE rel.relationType IN $relationTypes) AND`
      : '';
    
    return `
      MATCH (start:Memory {id: $startId})
      MATCH path = (start)-[r:RELATES_TO*1..${maxDepth}]->(end:Memory)
      WHERE ${relationFilter} end <> start AND end.id IS NOT NULL
      WITH end, length(path) as distance, relationships(path)[0] as firstRel
      RETURN DISTINCT end.id as id,
                      end.name as name,
                      end.memoryType as type,
                      distance,
                      firstRel.relationType as relation,
                      firstRel.strength as strength,
                      firstRel.source as source,
                      firstRel.createdAt as createdAt
      ORDER BY distance ASC, end.name ASC
      LIMIT 50
    `;
  }

  /**
   * Build inbound traversal query (what influences this memory)
   */
  private buildInboundTraversal(maxDepth: number, relationTypes?: string[]): string {
    const relationFilter = relationTypes 
      ? `ALL(rel IN relationships(path) WHERE rel.relationType IN $relationTypes) AND`
      : '';
    
    return `
      MATCH (target:Memory {id: $startId})
      MATCH path = (start:Memory)-[r:RELATES_TO*1..${maxDepth}]->(target)
      WHERE ${relationFilter} start <> target AND start.id IS NOT NULL
      WITH start, length(path) as distance, relationships(path)[-1] as lastRel
      RETURN DISTINCT start.id as id,
                      start.name as name,
                      start.memoryType as type,
                      distance,
                      lastRel.relationType as relation,
                      lastRel.strength as strength,
                      lastRel.source as source,
                      lastRel.createdAt as createdAt
      ORDER BY distance ASC, start.name ASC
      LIMIT 50
    `;
  }

  /**
   * Build bidirectional traversal query (all connected memories)
   */
  private buildBidirectionalTraversal(maxDepth: number, relationTypes?: string[]): string {
    const relationFilter = relationTypes 
      ? `ALL(rel IN relationships(path) WHERE rel.relationType IN $relationTypes) AND`
      : '';
    
    return `
      MATCH (center:Memory {id: $startId})
      MATCH path = (center)-[r:RELATES_TO*1..${maxDepth}]-(connected:Memory)
      WHERE ${relationFilter} connected <> center AND connected.id IS NOT NULL
      WITH connected, length(path) as distance, 
           CASE WHEN startNode(relationships(path)[0]) = center 
                THEN relationships(path)[0] 
                ELSE relationships(path)[-1] END as relevantRel
      RETURN DISTINCT connected.id as id,
                      connected.name as name,
                      connected.memoryType as type,
                      distance,
                      relevantRel.relationType as relation,
                      relevantRel.strength as strength,
                      relevantRel.source as source,
                      relevantRel.createdAt as createdAt
      ORDER BY distance ASC, connected.name ASC
      LIMIT 50
    `;
  }

  /**
   * Validate traversal options
   */
  private validateTraversalOptions(options: GraphTraversalOptions): void {
    if (!options.traverseFrom) {
      throw new Error('traverseFrom memory ID is required for graph traversal');
    }
    
    const limits = getLimitsConfig();
    if (options.maxDepth !== undefined && (options.maxDepth < 1 || options.maxDepth > limits.maxTraversalDepth)) {
      throw new Error(`maxDepth must be between 1 and ${limits.maxTraversalDepth}`);
    }
    
    const validDirections = ["outbound", "inbound", "both"];
    if (options.traverseDirection && !validDirections.includes(options.traverseDirection)) {
      throw new Error(`Invalid traversal direction: ${options.traverseDirection}. Valid options: ${validDirections.join(', ')}`);
    }
    
    if (options.traverseRelations && options.traverseRelations.length === 0) {
      throw new Error('traverseRelations array cannot be empty if provided');
    }
  }

  /**
   * Convert Neo4j integers in traversal results
   */
  processTraversalResults(results: any[]): TraversalResult[] {
    return results.map(result => ({
      id: result.id,
      name: result.name,
      type: result.type,
      distance: this.convertNeo4jInteger(result.distance),
      relation: result.relation,
      strength: result.strength,
      source: result.source,
      createdAt: result.createdAt
    }));
  }

  /**
   * Convert Neo4j Integer to JavaScript number
   */
  private convertNeo4jInteger(value: any): number {
    if (typeof value === 'number') return value;
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return 0;
  }

  /**
   * Get supported traversal directions for user guidance
   */
  getSupportedDirections(): string[] {
    return [
      'outbound: What this memory influences',
      'inbound: What influences this memory', 
      'both: All connected memories (default)'
    ];
  }
}
