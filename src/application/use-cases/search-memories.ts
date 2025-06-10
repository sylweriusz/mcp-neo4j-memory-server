/**
 * Search Memories Use Case
 * Single responsibility: Orchestrate memory search workflow
 */

import { SearchRepository, SearchRequest, SearchResult } from '../../domain/repositories/search-repository';
import { MCPValidationError, MCPErrorCodes } from '../../infrastructure/errors';

export class SearchMemoriesUseCase {
  constructor(private searchRepository: SearchRepository) {}

  async execute(request: SearchRequest): Promise<SearchResult[]> {
    // Validate search request
    if (!request.query || request.query.trim().length === 0) {
      throw new MCPValidationError(
        'Search query is required',
        MCPErrorCodes.EMPTY_QUERY
      );
    }

    if (request.limit !== undefined && request.limit <= 0) {
      throw new MCPValidationError(
        'Search limit must be positive',
        MCPErrorCodes.INVALID_LIMIT
      );
    }

    if (request.threshold && (request.threshold < 0 || request.threshold > 1)) {
      throw new MCPValidationError(
        'Search threshold must be between 0 and 1',
        MCPErrorCodes.INVALID_THRESHOLD
      );
    }

    // Execute search through repository
    return await this.searchRepository.search(request);
  }
}
