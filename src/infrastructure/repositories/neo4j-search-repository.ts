/**
 * Neo4j Search Repository - Truth-First Implementation
 * Single responsibility: Bridge search use case to truth-first orchestrator
 * 
 * THE IMPLEMENTOR'S RULE: Replace legacy search with GDD v2.2.0 compliant system
 */

import { SearchRepository, SearchRequest, SearchResult } from '../../domain/repositories/search-repository';
import { SessionFactory } from '../database/session-factory';
import { TruthFirstSearchOrchestrator, TruthSearchResult } from '../services/search';

/**
 * Truth-first search repository implementation
 * Zero fallback architecture with strict GDD v2.2.0 compliance
 */
export class Neo4jSearchRepository implements SearchRepository {
  constructor(private sessionFactory: SessionFactory) {}

  /**
   * Execute truth-first search with GDD v2.2.0 compliance
   * Performance targets: <100ms exact, <500ms vector
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const session = this.sessionFactory.createSession();
    
    try {
      const orchestrator = new TruthFirstSearchOrchestrator(session);
      
      const truthResults = await orchestrator.search(
        request.query,
        request.limit || 10,
        request.includeGraphContext !== false, // Default true
        request.memoryTypes,
        request.threshold || 0.1
      );

      // Convert TruthSearchResult to SearchResult format
      return this.convertToSearchResults(truthResults);
    } finally {
      await session.close();
    }
  }

  /**
   * Convert truth-first results to legacy SearchResult format
   * Maintains backward compatibility with existing use cases
   */
  private convertToSearchResults(truthResults: TruthSearchResult[]): SearchResult[] {
    return truthResults.map(result => ({
      memory: {
        id: result.id,
        name: result.name,
        memoryType: result.type,
        observations: result.observations,
        metadata: result.metadata,
        createdAt: result.createdAt,
        modifiedAt: result.modifiedAt,
        lastAccessed: result.lastAccessed,
        related: result.related
      },
      score: result.score || 0,
      matchType: this.determineMatchType(result.matchReason)
    }));
  }

  /**
   * Map truth-first match reasons to legacy match types
   */
  private determineMatchType(matchReason: string): 'vector' | 'metadata' | 'fulltext' {
    switch (matchReason) {
      case 'exact_metadata':
      case 'perfect_truth':
        return 'metadata';
      case 'exact_content':
        return 'fulltext';
      case 'semantic':
      default:
        return 'vector';
    }
  }

  /**
   * Legacy methods - not implemented in truth-first architecture
   * These throw explicit errors to prevent fallback usage
   */
  async vectorSearch(): Promise<SearchResult[]> {
    throw new Error('Direct vector search not supported in truth-first architecture. Use search() instead.');
  }

  async metadataSearch(): Promise<SearchResult[]> {
    throw new Error('Direct metadata search not supported in truth-first architecture. Use search() instead.');
  }

  async fulltextSearch(): Promise<SearchResult[]> {
    throw new Error('Direct fulltext search not supported in truth-first architecture. Use search() instead.');
  }
}
