/**
 * Manage Relations Use Case Tests
 * Single responsibility: Test enhanced relationship management (BUG #3 FIX)
 * THE IMPLEMENTOR'S RULE: Test the connections, not the dots
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageRelationsUseCase, RelationRequest } from '../../../src/application/use-cases/manage-relations';

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

  describe('Create Enhanced Relations - BUG #3 FIX', () => {
    it('should create relation with default metadata when none provided', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES'
      };

      const fromMemory = { id: 'Bm>memory1', name: 'Source Memory', memoryType: 'project' };
      const toMemory = { id: 'Bm>memory2', name: 'Target Memory', memoryType: 'research' };

      mockMemoryRepository.findById
        .mockResolvedValueOnce(fromMemory)
        .mockResolvedValueOnce(toMemory);

      await relationsUseCase.createRelation(request);

      expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledWith({
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES',
        strength: 0.5, // Default strength
        context: ['development', 'programming', 'analysis', 'learning'], // Auto-inferred
        source: 'agent', // Default source
        createdAt: expect.any(String) // System-generated timestamp
      });
    });

    it('should create relation with explicit metadata', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'DEPENDS_ON',
        strength: 0.9,
        context: ['architecture', 'security'],
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
        context: ['architecture', 'security'],
        source: 'user',
        createdAt: expect.any(String)
      });
    });

    it('should auto-infer context from memory types', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>creative1',
        toId: 'Bm>process1',
        relationType: 'INSPIRES'
      };

      const fromMemory = { id: 'Bm>creative1', name: 'Creative Work', memoryType: 'creative' };
      const toMemory = { id: 'Bm>process1', name: 'Process Doc', memoryType: 'process' };

      mockMemoryRepository.findById
        .mockResolvedValueOnce(fromMemory)
        .mockResolvedValueOnce(toMemory);

      await relationsUseCase.createRelation(request);

      expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.arrayContaining(['writing', 'ideation', 'workflow', 'methodology'])
        })
      );
    });

    it('should reject creation for non-existent source memory', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>nonexistent',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES'
      };

      mockMemoryRepository.findById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'Bm>memory2', name: 'Target', memoryType: 'test' });

      await expect(relationsUseCase.createRelation(request)).rejects.toThrow(
        'Source memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.createEnhancedRelation).not.toHaveBeenCalled();
    });

    it('should reject creation for non-existent target memory', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>memory1',
        toId: 'Bm>nonexistent',
        relationType: 'INFLUENCES'
      };

      mockMemoryRepository.findById
        .mockResolvedValueOnce({ id: 'Bm>memory1', name: 'Source', memoryType: 'test' })
        .mockResolvedValueOnce(null);

      await expect(relationsUseCase.createRelation(request)).rejects.toThrow(
        'Target memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.createEnhancedRelation).not.toHaveBeenCalled();
    });
  });

  describe('Delete Relations', () => {
    it('should delete existing relation', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES'
      };

      const fromMemory = { id: 'Bm>memory1', name: 'Source', memoryType: 'test' };

      mockMemoryRepository.findById.mockResolvedValue(fromMemory);

      await relationsUseCase.deleteRelation(request);

      expect(mockMemoryRepository.deleteRelation).toHaveBeenCalledWith(
        'Bm>memory1',
        'Bm>memory2',
        'INFLUENCES'
      );
    });

    it('should reject deletion for non-existent source memory', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>nonexistent',
        toId: 'Bm>memory2',
        relationType: 'INFLUENCES'
      };

      mockMemoryRepository.findById.mockResolvedValue(null);

      await expect(relationsUseCase.deleteRelation(request)).rejects.toThrow(
        'Source memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.deleteRelation).not.toHaveBeenCalled();
    });
  });

  describe('Context Inference Logic', () => {
    it('should handle known memory types', async () => {
      const testCases = [
        { type: 'project', expected: ['development', 'programming'] },
        { type: 'research', expected: ['analysis', 'learning'] },
        { type: 'creative', expected: ['writing', 'ideation'] },
        { type: 'process', expected: ['workflow', 'methodology'] },
        { type: 'preference', expected: ['personal', 'configuration'] },
        { type: 'review', expected: ['feedback', 'evaluation'] }
      ];

      for (const testCase of testCases) {
        const request: RelationRequest = {
          fromId: 'Bm>memory1',
          toId: 'Bm>memory2',
          relationType: 'RELATES_TO'
        };

        const fromMemory = { id: 'Bm>memory1', name: 'Source', memoryType: testCase.type };
        const toMemory = { id: 'Bm>memory2', name: 'Target', memoryType: 'general' };

        mockMemoryRepository.findById
          .mockResolvedValueOnce(fromMemory)
          .mockResolvedValueOnce(toMemory);

        await relationsUseCase.createRelation(request);

        expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledWith(
          expect.objectContaining({
            context: expect.arrayContaining(testCase.expected)
          })
        );

        vi.clearAllMocks();
      }
    });

    it('should handle unknown memory types', async () => {
      const request: RelationRequest = {
        fromId: 'Bm>memory1',
        toId: 'Bm>memory2',
        relationType: 'RELATES_TO'
      };

      const fromMemory = { id: 'Bm>memory1', name: 'Source', memoryType: 'unknown_type' };
      const toMemory = { id: 'Bm>memory2', name: 'Target', memoryType: 'another_unknown' };

      mockMemoryRepository.findById
        .mockResolvedValueOnce(fromMemory)
        .mockResolvedValueOnce(toMemory);

      await relationsUseCase.createRelation(request);

      expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          context: [] // Empty array for unknown types
        })
      );
    });
  });

  describe('Batch Operations', () => {
    it('should execute multiple create operations', async () => {
      const requests: RelationRequest[] = [
        { fromId: 'Bm>memory1', toId: 'Bm>memory2', relationType: 'INFLUENCES' },
        { fromId: 'Bm>memory2', toId: 'Bm>memory3', relationType: 'DEPENDS_ON' }
      ];

      const mockMemory = { id: 'test', name: 'Test', memoryType: 'test' };
      mockMemoryRepository.findById.mockResolvedValue(mockMemory);

      const result = await relationsUseCase.executeMany('create', requests);

      expect(result.processed).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockMemoryRepository.createEnhancedRelation).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success/failure in batch operations', async () => {
      const requests: RelationRequest[] = [
        { fromId: 'Bm>exists', toId: 'Bm>exists2', relationType: 'INFLUENCES' },
        { fromId: 'Bm>nonexistent', toId: 'Bm>exists2', relationType: 'DEPENDS_ON' }
      ];

      mockMemoryRepository.findById
        .mockResolvedValueOnce({ id: 'Bm>exists', name: 'Exists', memoryType: 'test' })
        .mockResolvedValueOnce({ id: 'Bm>exists2', name: 'Exists2', memoryType: 'test' })
        .mockResolvedValueOnce(null);

      const result = await relationsUseCase.executeMany('create', requests);

      expect(result.processed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to create relation Bm>nonexistent -> Bm>exists2');
    });
  });
});
