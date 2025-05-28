/**
 * Search Memories Use Case
 * Single responsibility: Orchestrate memory search workflow
 */

import { SearchRepository, SearchRequest, SearchResult } from '../../domain/repositories/search-repository';

export class SearchMemoriesUseCase {
  constructor(private searchRepository: SearchRepository) {}

  async execute(request: SearchRequest): Promise<SearchResult[]> {
    // Validate search request
    if (!request.query || request.query.trim().length === 0) {
      throw new Error('Search query is required');
    }

    if (request.limit && request.limit <= 0) {
      throw new Error('Search limit must be positive');
    }

    if (request.threshold && (request.threshold < 0 || request.threshold > 1)) {
      throw new Error('Search threshold must be between 0 and 1');
    }

    // Execute search through repository
    return await this.searchRepository.search(request);
  }
}
