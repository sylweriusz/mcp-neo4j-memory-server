/**
 * Delete Memory Use Case
 * Clean Architecture Application Layer
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { createErrorMessage } from '../../infrastructure/utilities';
import { MCPResourceNotFoundError, MCPErrorCodes } from '../../infrastructure/errors';

export class DeleteMemoryUseCase {
  constructor(private memoryRepository: MemoryRepository) {}

  async execute(id: string): Promise<boolean> {
    const existingMemory = await this.memoryRepository.findById(id);
    if (!existingMemory) {
      throw new MCPResourceNotFoundError('Memory', id, MCPErrorCodes.MEMORY_NOT_FOUND);
    }

    return await this.memoryRepository.delete(id);
  }

  async executeMany(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
    const results: { deleted: number; errors: string[] } = { deleted: 0, errors: [] };
    
    for (const id of ids) {
      try {
        await this.execute(id);
        results.deleted++;
      } catch (error) {
        results.errors.push(createErrorMessage(`Failed to delete ${id}`, error));
      }
    }
    
    return results;
  }
}
