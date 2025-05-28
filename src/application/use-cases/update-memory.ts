/**
 * Update Memory Use Case
 * Clean Architecture Application Layer
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { Memory } from '../../domain/entities/memory';

export interface UpdateMemoryRequest {
  id: string;
  name?: string;
  memoryType?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export class UpdateMemoryUseCase {
  constructor(private memoryRepository: MemoryRepository) {}

  async execute(request: UpdateMemoryRequest): Promise<Memory> {
    const existingMemory = await this.memoryRepository.findById(request.id);
    if (!existingMemory) {
      throw new Error(`Memory with id ${request.id} not found`);
    }

    // Create updated memory object
    const updatedMemory: Memory = {
      ...existingMemory,
      ...(request.name && { name: request.name }),
      ...(request.memoryType && { memoryType: request.memoryType }),
      ...(request.metadata && { metadata: request.metadata }),
      ...(request.tags && { tags: request.tags }),
      modifiedAt: new Date().toISOString()
    };

    return await this.memoryRepository.update(updatedMemory);
  }
}
