/**
 * Manage Relations Use Case
 * Clean Architecture Application Layer
 * BUG #3 FIX: Enhanced relationship metadata support (GDD v2.0.12+)
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';

export interface RelationRequest {
  fromId: string;
  toId: string;
  relationType: string;
  // BUG #3 FIX: Enhanced metadata fields
  strength?: number;      // 0.0-1.0, defaults to 0.5
  context?: string[];     // Domain contexts, auto-inferred if not provided
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

    // BUG #3 FIX: Enhanced relation creation with metadata
    const enhancedRequest = {
      fromId: request.fromId,
      toId: request.toId,
      relationType: request.relationType,
      strength: request.strength || 0.5,  // Default strength
      context: request.context || this.inferContext(fromMemory, toMemory),  // Auto-infer if not provided
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

  /**
   * Context inference logic as per GDD v2.0.12+
   */
  private inferContext(fromMemory: any, toMemory: any): string[] {
    const typeContextMap: Record<string, string[]> = {
      'project': ['development', 'programming'],
      'research': ['analysis', 'learning'],
      'creative': ['writing', 'ideation'],
      'process': ['workflow', 'methodology'],
      'preference': ['personal', 'configuration'],
      'review': ['feedback', 'evaluation'],
      'programming': ['development', 'coding'],
      'procedure': ['workflow', 'process'],
      'security': ['cybersecurity', 'protection'],
      'ai': ['artificial-intelligence', 'machine-learning']
    };
    
    const contexts = new Set([
      ...(typeContextMap[fromMemory.memoryType] || []),
      ...(typeContextMap[toMemory.memoryType] || [])
    ]);
    
    return Array.from(contexts);
  }

  async executeMany(
    operation: 'create' | 'delete',
    requests: RelationRequest[]
  ): Promise<{ processed: number; errors: string[] }> {
    const results = { processed: 0, errors: [] };
    
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
          `Failed to ${operation} relation ${request.fromId} -> ${request.toId}: ${error.message}`
        );
      }
    }
    
    return results;
  }
}
