/**
 * Create Memory Use Case
 * Single responsibility: Orchestrate memory creation workflow
 */

import { Memory } from '../../domain/entities/memory';
import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { EmbeddingService } from '../../infrastructure/services/embedding-service';
import { generateCompactId } from '../../id_generator';

export interface CreateMemoryRequest {
  name: string;
  memoryType: string;
  metadata?: Record<string, any>;
  observations?: string[];
}

export class CreateMemoryUseCase {
  constructor(
    private memoryRepository: MemoryRepository,
    private embeddingService: EmbeddingService
  ) {}

  async execute(request: CreateMemoryRequest): Promise<Memory> {
    // Generate unique ID
    const id = generateCompactId();
    
    // Generate name embedding for semantic search
    const nameEmbedding = await this.embeddingService.calculateEmbedding(request.name);
    
    // Create domain entity with validation
    const memory = new Memory(
      id,
      request.name,
      request.memoryType,
      request.metadata || {},
      new Date(),
      new Date(),
      new Date()
    );

    // Add nameEmbedding to memory object for persistence
    (memory as any).nameEmbedding = nameEmbedding;

    // Persist through repository
    const createdMemory = await this.memoryRepository.create(memory);
    
    // Add observations if provided
    if (request.observations && request.observations.length > 0) {
      await this.memoryRepository.addObservations(id, request.observations);
    }

    return createdMemory;
  }
}
