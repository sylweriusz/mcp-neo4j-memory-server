/**
 * Delete Memory Use Case
 * Clean Architecture Application Layer
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';

export class DeleteMemoryUseCase {
  constructor(private memoryRepository: MemoryRepository) {}

  async execute(id: string): Promise<boolean> {
    const existingMemory = await this.memoryRepository.findById(id);
    if (!existingMemory) {
      throw new Error(`Memory with id ${id} not found`);
    }

    return await this.memoryRepository.delete(id);
  }

  async executeMany(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
    const results = { deleted: 0, errors: [] };
    
    for (const id of ids) {
      try {
        await this.execute(id);
        results.deleted++;
      } catch (error) {
        results.errors.push(`Failed to delete ${id}: ${error.message}`);
      }
    }
    
    return results;
  }
}
