/**
 * Search Service - Clean Architecture Implementation
 * Single responsibility: bridge search requests to clean search orchestrator
 */

import { SearchRequest, SearchResult } from '../../domain/repositories/search-repository';
import { SessionFactory } from '../database/session-factory';
import { SearchOrchestrator } from '../services/search/search-orchestrator';
import { DEFAULT_SEARCH_CONFIG } from '../../domain/entities/search-config';

export class SearchService {
  constructor(private sessionFactory: SessionFactory) {}

  async enhancedUnifiedSearch(request: SearchRequest): Promise<SearchResult[]> {
    const session = this.sessionFactory.createSession();
    try {
      const searchOrchestrator = new SearchOrchestrator(session, DEFAULT_SEARCH_CONFIG);
      
      const results = await searchOrchestrator.search(
        request.query,
        Math.floor(request.limit || 10), // Ensure integer for Neo4j
        request.includeGraphContext,
        request.memoryTypes,
        request.threshold
      );

      // Convert to SearchResult format
      return results.map(result => ({
        memory: {
          id: result.id,
          name: result.name,
          memoryType: result.type,
          observations: result.observations,
          tags: result.tags,
          metadata: result.metadata,
          related: result.related
        },
        score: result.score || 0
      }));
    } finally {
      await session.close();
    }
  }
}
