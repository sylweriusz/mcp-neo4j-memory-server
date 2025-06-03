/**
 * Manage Relations Use Case Tests
 * Single responsibility: Test relationship creation and deletion
 * CURRENT REALITY: Enhanced relations have strength + source, NO context (simplified per GDD)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageRelationsUseCase } from '../../../src/application/use-cases/manage-relations';

describe('ManageRelationsUseCase', () => {
  let relationsUseCase: ManageRelationsUseCase;
  let mockMemoryRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockMemoryRepository = {
      findById: vi.fn(),
      createEnhancedRelation: vi.fn(),
      deleteRelation: vi.fn()
    };

    relationsUseCase = new ManageRelationsUseCase(mockMemoryRepository);
  });

  describe('Create Enhanced Relations', () => {
    it('should create relation with default metadata when none provided', async () => {
      const request = {
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES'
      };

      const fromMemory = { id: 'Bm>memory1', name: 'Source', memoryType: 'project' };
      const toMemory = { id: 'Bm>memory2', name: 'Target', memoryType: 'research' };

      mockMemoryRepository.findById
        .mockResolvedValueOnce(fromMemory)
        .mockResolvedValueOnce(toMemory);

      await relationsUseCase.createRelation(request);

      expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledWith({
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES',
        strength: 0.5, // Default strength
        source: 'agent', // Default source
        createdAt: expect.any(String) // System-generated timestamp
      });
    });

    it('should create relation with explicit metadata', async () => {
      const request = {
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'DEPENDS_ON',
        strength: 0.9,
        source: 'user'
      };

      const fromMemory = { id: 'Bm>memory1', name: 'Source', memoryType: 'security' };
      const toMemory = { id: 'Bm>memory2', name: 'Target', memoryType: 'ai' };

      mockMemoryRepository.findById
        .mockResolvedValueOnce(fromMemory)
        .mockResolvedValueOnce(toMemory);

      await relationsUseCase.createRelation(request);

      expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledWith({
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'DEPENDS_ON',
        strength: 0.9,
        source: 'user',
        createdAt: expect.any(String)
      });
    });

    it('should reject creation for non-existent source memory', async () => {
      const request = {
        fromId: 'Bm>nonexistent',
        toId: 'Bm>memory2',
        relationType: 'RELATES_TO'
      };

      mockMemoryRepository.findById.mockResolvedValueOnce(null); // Source not found

      await expect(relationsUseCase.createRelation(request)).rejects.toThrow(
        'Source memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.createEnhancedRelation).not.toHaveBeenCalled();
    });

    it('should reject creation for non-existent target memory', async () => {
      const request = {
        fromId: 'Bm>memory1',
        toId: 'Bm>nonexistent',
        relationType: 'RELATES_TO'
      };

      const fromMemory = { id: 'Bm>memory1', name: 'Source', memoryType: 'project' };

      mockMemoryRepository.findById
        .mockResolvedValueOnce(fromMemory)
        .mockResolvedValueOnce(null); // Target not found

      await expect(relationsUseCase.createRelation(request)).rejects.toThrow(
        'Target memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.createEnhancedRelation).not.toHaveBeenCalled();
    });
  });

  describe('Delete Relations', () => {
    it('should delete existing relation', async () => {
      const request = {
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES'
      };

      const fromMemory = { id: 'Bm>memory1', name: 'Source', memoryType: 'project' };

      mockMemoryRepository.findById.mockResolvedValue(fromMemory);

      await relationsUseCase.deleteRelation(request);

      expect(mockMemoryRepository.deleteRelation).toHaveBeenCalledWith(
        'Bm>memory1',
        'Bm>memory2', 
        'INFLUENCES'
      );
    });

    it('should reject deletion for non-existent source memory', async () => {
      const request = {
        fromId: 'Bm>nonexistent',
        toId: 'Bm>memory2',
        relationType: 'RELATES_TO'
      };

      mockMemoryRepository.findById.mockResolvedValue(null);

      await expect(relationsUseCase.deleteRelation(request)).rejects.toThrow(
        'Source memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.deleteRelation).not.toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    it('should execute multiple create operations', async () => {
      const requests = [
        { fromId: 'Bm>mem1', toId: 'Bm>mem2', relationType: 'INFLUENCES' },
        { fromId: 'Bm>mem2', toId: 'Bm>mem3', relationType: 'DEPENDS_ON' }
      ];

      const mockMemory = { id: 'test', name: 'Test', memoryType: 'project' };
      mockMemoryRepository.findById.mockResolvedValue(mockMemory);

      const result = await relationsUseCase.executeMany('create', requests);

      expect(result.processed).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success/failure in batch operations', async () => {
      const requests = [
        { fromId: 'Bm>valid', toId: 'Bm>mem2', relationType: 'INFLUENCES' },
        { fromId: 'Bm>invalid', toId: 'Bm>mem3', relationType: 'DEPENDS_ON' }
      ];

      mockMemoryRepository.findById
        .mockResolvedValueOnce({ id: 'valid' })  // First relation succeeds
        .mockResolvedValueOnce({ id: 'mem2' })
        .mockResolvedValueOnce(null);  // Second relation fails

      const result = await relationsUseCase.executeMany('create', requests);

      expect(result.processed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Bm>invalid');
    });
  });
});
