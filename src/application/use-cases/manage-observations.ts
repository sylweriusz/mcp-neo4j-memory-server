/**
 * Manage Observations Use Case
 * Clean Architecture Application Layer
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';

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
      throw new Error(`Memory with id ${request.memoryId} not found`);
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
      throw new Error(`Memory with id ${request.memoryId} not found`);
    }

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
    const results = { processed: 0, errors: [] };
    
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
          `Failed to ${operation} observations for memory ${request.memoryId}: ${error.message}`
        );
      }
    }
    
    return results;
  }
}
