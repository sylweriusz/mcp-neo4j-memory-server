/**
 * Manage Observations Use Case
 * Clean Architecture Application Layer
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { createErrorMessage } from '../../infrastructure/utilities';
import { MCPResourceNotFoundError, MCPValidationError, MCPErrorCodes } from '../../infrastructure/errors';

export interface ObservationRequest {
  memoryId: string;
  contents: string[];
}

export class ManageObservationsUseCase {
  constructor(
    private memoryRepository: MemoryRepository
  ) {}

  async addObservations(request: ObservationRequest): Promise<void> {
    const memory = await this.memoryRepository.findById(request.memoryId);
    if (!memory) {
      throw new MCPResourceNotFoundError('Memory', request.memoryId, MCPErrorCodes.MEMORY_NOT_FOUND);
    }

    // Add observations to the memory
    await this.memoryRepository.addObservations(
      request.memoryId, 
      request.contents
    );
  }

  async deleteObservations(request: ObservationRequest): Promise<void> {
    const memory = await this.memoryRepository.findById(request.memoryId);
    if (!memory) {
      throw new MCPResourceNotFoundError('Memory', request.memoryId, MCPErrorCodes.MEMORY_NOT_FOUND);
    }

    // VALIDATE: For delete operation, ensure contents are observation IDs
    this.validateObservationIds(request.contents);

    // Delete observations from the memory
    return await this.memoryRepository.deleteObservations(
      request.memoryId, 
      request.contents
    );
  }

  async executeMany(
    operation: 'add' | 'delete',
    requests: ObservationRequest[]
  ): Promise<{ processed: number; errors: string[] }> {
    const results: { processed: number; errors: string[] } = { processed: 0, errors: [] };
    
    for (const request of requests) {
      try {
        if (operation === 'add') {
          await this.addObservations(request);
          results.processed += request.contents.length;  // ✅ Count actual observations
        } else {
          await this.deleteObservations(request);
          results.processed += request.contents.length;  // ✅ Count actual observations
        }
      } catch (error) {
        results.errors.push(
          createErrorMessage(`Failed to ${operation} observations for memory ${request.memoryId}`, error)
        );
      }
    }
    
    return results;
  }

  /**
   * Validate that provided strings are observation IDs for delete operations
   * Observation IDs must be 18-character BASE85 identifiers
   */
  private validateObservationIds(contents: string[]): void {
    for (const content of contents) {
      if (!this.isValidObservationId(content)) {
        throw new MCPValidationError(
          `DELETE operation requires observation IDs, not content strings. ` +
          `Received: "${content}". ` +
          `Expected: 18-character BASE85 identifier (e.g., "dZD1/D-Ljt*!I?R)\`-"). ` +
          `To delete observations: 1) First search/retrieve memory to get observation IDs, ` +
          `2) Then use those IDs for deletion.`,
          MCPErrorCodes.INVALID_OBSERVATION_CONTENT
        );
      }
    }
  }

  /**
   * Check if string matches observation ID pattern (18-char BASE85)
   */
  private isValidObservationId(str: string): boolean {
    // Observation IDs are 18 characters long and use BASE85 charset
    if (str.length !== 18) {
      return false;
    }
    
    // BASE85 charset: 0-9, A-Z, a-z, and specific symbols
    // From id_generator.ts: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;=?@_{}~`'
    const base85Pattern = /^[0-9A-Za-z!#$%&()*+,\-./:;=?@_{}~`]+$/;
    return base85Pattern.test(str);
  }
}
