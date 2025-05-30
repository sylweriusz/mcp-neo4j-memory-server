/**
 * Manage Observations Use Case
 * Clean Architecture Application Layer
 * BUG #2 FIX: Now includes tag re-extraction when observations are added
 */

import { MemoryRepository } from '../../domain/repositories/memory-repository';
import { TagExtractionService } from '../../infrastructure/services/tag-extraction-service';

export interface ObservationRequest {
  memoryId: string;
  contents: string[];
}

export class ManageObservationsUseCase {
  constructor(
    private memoryRepository: MemoryRepository,
    private tagExtractionService?: TagExtractionService  // BUG #2 FIX: Optional injection for tag re-extraction
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

    // BUG #2 FIX: Re-extract tags when observations are added (GDD v2.1.2 requirement)
    if (this.tagExtractionService) {
      try {
        console.error(`[DEBUG] Starting tag re-extraction for memory ${request.memoryId}`);
        
        // Get updated memory with new observations
        const updatedMemory = await this.memoryRepository.findById(request.memoryId);
        if (updatedMemory) {
          console.error(`[DEBUG] Found memory with ${updatedMemory.observations?.length || 0} observations`);
          
          // Extract new tags from memory name + all observations
          const observationContents = updatedMemory.observations?.map(obs => obs.content) || [];
          console.error(`[DEBUG] Observation contents: ${JSON.stringify(observationContents)}`);
          console.error(`[DEBUG] Memory name: ${updatedMemory.name}`);
          
          const newTags = await this.tagExtractionService.extractTagsForMemory(
            updatedMemory.name,
            observationContents,
            updatedMemory.tags || [],
            true  // Signal that we're adding new observations
          );
          console.error(`[DEBUG] Extracted tags: ${(newTags || []).join(', ')}`);
          console.error(`[DEBUG] Current tags: ${(updatedMemory.tags || []).join(', ')}`);

          // Update memory with new tags if they changed
          const newTagsSorted = JSON.stringify((newTags || []).sort());
          const currentTagsSorted = JSON.stringify((updatedMemory.tags || []).sort());
          const tagComparison = newTagsSorted !== currentTagsSorted;
          console.error(`[DEBUG] New tags sorted: ${newTagsSorted}`);
          console.error(`[DEBUG] Current tags sorted: ${currentTagsSorted}`);
          console.error(`[DEBUG] Tags changed: ${tagComparison}, newTags.length: ${(newTags || []).length}`);
          
          if ((newTags || []).length > 0 && tagComparison) {
            console.error(`[DEBUG] Updating memory with new tags`);
            await this.memoryRepository.update({
              ...updatedMemory,
              tags: newTags,
              modifiedAt: new Date().toISOString()
            });
            console.error(`[DEBUG] Memory updated successfully`);
          } else {
            console.error(`[DEBUG] No tag update needed`);
          }
        } else {
          console.error(`[DEBUG] Memory not found after observation addition`);
        }
      } catch (error) {
        console.error(`[ERROR] Tag re-extraction failed for memory ${request.memoryId}:`, error);
        // Don't fail the observation addition if tag extraction fails
      }
    } else {
      console.error(`[DEBUG] No tagExtractionService available`);
    }
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
        } else {
          await this.deleteObservations(request);
        }
        results.processed++;
      } catch (error) {
        results.errors.push(
          `Failed to ${operation} observations for memory ${request.memoryId}: ${error.message}`
        );
      }
    }
    
    return results;
  }
}
