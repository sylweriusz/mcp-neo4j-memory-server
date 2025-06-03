/**
 * Manage Relations Use Case
 * Clean Architecture Application Layer
 * BUG #3 FIX: Enhanced relationship metadata support (GDD v2.3.1+)
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { createErrorMessage } from '../../infrastructure/utilities';

export interface RelationRequest {
  fromId: string;
  toId: string;
  relationType: string;
  // Enhanced metadata fields (simplified without context complexity)
  strength?: number;      // 0.0-1.0, defaults to 0.5
  source?: 'agent' | 'user' | 'system';  // Defaults to 'agent'
}

export class ManageRelationsUseCase {
  constructor(private memoryRepository: MemoryRepository) {}

  async createRelation(request: RelationRequest): Promise<void> {
    // Verify both memories exist
    const fromMemory = await this.memoryRepository.findById(request.fromId);
    if (!fromMemory) {
      throw new Error(`Source memory with id ${request.fromId} not found`);
    }

    const toMemory = await this.memoryRepository.findById(request.toId);
    if (!toMemory) {
      throw new Error(`Target memory with id ${request.toId} not found`);
    }

    // Enhanced relation creation without context complexity
    const enhancedRequest = {
      fromId: request.fromId,
      toId: request.toId,
      relationType: request.relationType,
      strength: request.strength || 0.5,  // Default strength
      source: request.source || 'agent',  // Default source
      createdAt: new Date().toISOString()  // Always system-generated
    };

    // Create the enhanced relation
    return await this.memoryRepository.createEnhancedRelation(enhancedRequest);
  }

  async deleteRelation(request: RelationRequest): Promise<void> {
    // Verify relation exists
    const fromMemory = await this.memoryRepository.findById(request.fromId);
    if (!fromMemory) {
      throw new Error(`Source memory with id ${request.fromId} not found`);
    }

    // Delete the relation
    return await this.memoryRepository.deleteRelation(
      request.fromId,
      request.toId,
      request.relationType
    );
  }

  async executeMany(
    operation: 'create' | 'delete',
    requests: RelationRequest[]
  ): Promise<{ processed: number; errors: string[] }> {
    const results: { processed: number; errors: string[] } = { processed: 0, errors: [] };
    
    for (const request of requests) {
      try {
        if (operation === 'create') {
          await this.createRelation(request);
        } else {
          await this.deleteRelation(request);
        }
        results.processed++;
      } catch (error) {
        results.errors.push(
          createErrorMessage(`Failed to ${operation} relation ${request.fromId} -> ${request.toId}`, error)
        );
      }
    }
    
    return results;
  }
}
