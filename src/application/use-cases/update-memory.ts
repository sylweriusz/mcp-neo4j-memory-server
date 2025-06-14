/**
 * Update Memory Use Case
 * Clean Architecture Application Layer
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { Memory } from '../../domain/entities/memory';
import { MCPResourceNotFoundError, MCPErrorCodes } from '../../infrastructure/errors';

export interface UpdateMemoryRequest {
  id: string;
  name?: string;
  memoryType?: string;
  metadata?: Record<string, any>;
}

export class UpdateMemoryUseCase {
  constructor(private memoryRepository: MemoryRepository) {}

  async execute(request: UpdateMemoryRequest): Promise<Memory> {
    const existingMemory = await this.memoryRepository.findById(request.id);
    if (!existingMemory) {
      throw new MCPResourceNotFoundError('Memory', request.id, MCPErrorCodes.MEMORY_NOT_FOUND);
    }

    // Create updated memory object
    const updatedMemory: Memory = {
      ...existingMemory,
      ...(request.name !== undefined && { name: request.name }),
      ...(request.memoryType !== undefined && { memoryType: request.memoryType }),
      ...(request.metadata !== undefined && { metadata: request.metadata }),
      modifiedAt: new Date()
    };

    return await this.memoryRepository.update(updatedMemory);
  }
}
