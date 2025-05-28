/**
 * Neo4j Search Repository - Main Interface
 * Single responsibility: Orchestrate search operations
 */

import { SearchRepository, SearchRequest, SearchResult } from '../../domain/repositories/search-repository';
import { SearchService } from './search-service';
import { SessionFactory } from '../database/session-factory';

export class Neo4jSearchRepository implements SearchRepository {
  private searchService: SearchService;

  constructor(sessionFactory: SessionFactory) {
    this.searchService = new SearchService(sessionFactory);
  }

  async search(request: SearchRequest): Promise<SearchResult[]> {
    return await this.searchService.enhancedUnifiedSearch(request);
  }

  async vectorSearch(embedding: number[], threshold: number, limit: number): Promise<SearchResult[]> {
    return await this.searchService.vectorSearch(embedding, threshold, limit);
  }

  async metadataSearch(metadata: Record<string, any>, limit: number): Promise<SearchResult[]> {
    return await this.searchService.metadataSearch(metadata, limit);
  }

  async fulltextSearch(query: string, limit: number): Promise<SearchResult[]> {
    return await this.searchService.fulltextSearch(query, limit);
  }

  async tagSearch(tags: string[], limit: number): Promise<SearchResult[]> {
    return await this.searchService.tagSearch(tags, limit);
  }
}
