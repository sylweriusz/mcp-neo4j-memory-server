/**
 * Neo4j Search Repository - Simplified Implementation
 * Single responsibility: Bridge search use case to simplified search service
 * 
 * THE IMPLEMENTOR'S RULE: Clean, direct implementation without orchestration theater
 */

import { SearchRepository, SearchRequest, SearchResult } from '../../domain/repositories/search-repository';
import { SessionFactory } from '../database/session-factory';
import { SimplifiedSearchService, SimpleSearchResult } from '../services/search/simplified-search-service';

/**
 * Simplified search repository implementation
 * Direct execution with mathematical scoring
 */
export class Neo4jSearchRepository implements SearchRepository {
  constructor(private sessionFactory: SessionFactory) {}

  /**
   * Execute search with simplified service
   * Performance targets: <100ms exact, <500ms vector
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const session = this.sessionFactory.createSession();
    
    try {
      const searchService = new SimplifiedSearchService(session);
      
      const results = await searchService.search(
        request.query,
        request.limit || 10,
        request.includeGraphContext !== false, // Default true
        request.memoryTypes,
        request.threshold || 0.1
      );

      // Convert SimpleSearchResult to SearchResult format
      return this.convertToSearchResults(results);
    } finally {
      await session.close();
    }
  }

  /**
   * Convert simplified results to legacy SearchResult format
   * Maintains backward compatibility with existing use cases
   */
  private convertToSearchResults(simpleResults: SimpleSearchResult[]): SearchResult[] {
    return simpleResults.map(result => ({
      memory: {
        id: result.id,
        name: result.name,
        memoryType: result.type,
        observations: result.observations,
        metadata: result.metadata,
        createdAt: result.createdAt ? new Date(result.createdAt) : new Date(),
        modifiedAt: result.modifiedAt ? new Date(result.modifiedAt) : new Date(),
        lastAccessed: result.lastAccessed ? new Date(result.lastAccessed) : new Date(),
        related: result.related
      },
      score: result.score || 0,
      matchType: this.determineMatchType(result.matchType)
    }));
  }

  /**
   * Map simple search results to match types
   */
  private determineMatchType(matchType: 'semantic' | 'exact'): 'vector' | 'metadata' {
    switch (matchType) {
      case 'semantic':
        return 'vector';
      case 'exact':
        return 'metadata';
      default:
        return 'vector';
    }
  }
}
