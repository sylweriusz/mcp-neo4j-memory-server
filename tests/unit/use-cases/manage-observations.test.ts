/**
 * Manage Observations Use Case Tests - FULL PIPELINE COVERAGE
 * Single responsibility: Test observation management that keeps memory intact
 * Focus: Cover the 17.39% gap that could leave production observation pipelines broken
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageObservationsUseCase, ObservationRequest } from '../../../src/application/use-cases/manage-observations';
import { MemoryRepository } from '../../../src/domain/repositories/memory-repository';

describe('ManageObservationsUseCase - The Observation Pipeline', () => {
  let useCase: ManageObservationsUseCase;
  let mockRepository: MemoryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the repository that actually handles the data operations
    mockRepository = {
      findById: vi.fn(),
      addObservations: vi.fn(),
      deleteObservations: vi.fn(),
      // Add other required methods as stubs
      create: vi.fn(),
      findByIds: vi.fn(), 
      findByType: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      findWithFilters: vi.fn(),
      createRelation: vi.fn(),
      createEnhancedRelation: vi.fn(),
      deleteRelation: vi.fn()
    } as any;
    
    useCase = new ManageObservationsUseCase(mockRepository);
  });

  describe('Adding Observations', () => {
    it('should add observations to existing memory', async () => {
      // Setup: Mock memory exists
      const mockMemory = { id: 'mem123', name: 'Test Memory' };
      mockRepository.findById = vi.fn().mockResolvedValue(mockMemory);
      mockRepository.addObservations = vi.fn().mockResolvedValue(undefined);

      const request: ObservationRequest = {
        memoryId: 'mem123',
        contents: ['First observation', 'Second observation']
      };

      // Execute
      await useCase.addObservations(request);

      // Verify
      expect(mockRepository.findById).toHaveBeenCalledWith('mem123');
      expect(mockRepository.addObservations).toHaveBeenCalledWith('mem123', [
        'First observation',
        'Second observation'
      ]);
    });

    it('should fail when memory does not exist', async () => {
      // Setup: Memory not found
      mockRepository.findById = vi.fn().mockResolvedValue(null);

      const request: ObservationRequest = {
        memoryId: 'nonexistent',
        contents: ['Observation for missing memory']
      };

      // Execute & Verify
      await expect(useCase.addObservations(request))
        .rejects.toThrow('Memory with id nonexistent not found');
      
      expect(mockRepository.findById).toHaveBeenCalledWith('nonexistent');
      expect(mockRepository.addObservations).not.toHaveBeenCalled();
    });

    it('should handle empty observation list', async () => {
      // Setup: Mock memory exists
      const mockMemory = { id: 'mem123', name: 'Test Memory' };
      mockRepository.findById = vi.fn().mockResolvedValue(mockMemory);
      mockRepository.addObservations = vi.fn().mockResolvedValue(undefined);

      const request: ObservationRequest = {
        memoryId: 'mem123',
        contents: [] // Empty array should still work
      };

      // Execute
      await useCase.addObservations(request);

      // Verify - should still call repository with empty array
      expect(mockRepository.addObservations).toHaveBeenCalledWith('mem123', []);
    });
  });

  describe('Deleting Observations', () => {
    it('should delete observations from existing memory', async () => {
      // Setup: Mock memory exists
      const mockMemory = { id: 'mem456', name: 'Memory with Observations' };
      mockRepository.findById = vi.fn().mockResolvedValue(mockMemory);
      mockRepository.deleteObservations = vi.fn().mockResolvedValue(undefined);

      const request: ObservationRequest = {
        memoryId: 'mem456',
        contents: [
          'abcd1234efgh5678AB',  // Valid 18-char BASE85 ID
          'wxyz9876mnop5432CD'   // Valid 18-char BASE85 ID
        ]
      };

      // Execute
      await useCase.deleteObservations(request);

      // Verify
      expect(mockRepository.findById).toHaveBeenCalledWith('mem456');
      expect(mockRepository.deleteObservations).toHaveBeenCalledWith('mem456', [
        'abcd1234efgh5678AB',
        'wxyz9876mnop5432CD'
      ]);
    });

    it('should fail when memory does not exist for deletion', async () => {
      // Setup: Memory not found
      mockRepository.findById = vi.fn().mockResolvedValue(null);

      const request: ObservationRequest = {
        memoryId: 'missing-memory',
        contents: ['abcd1234efgh5678AB'] // Valid observation ID
      };

      // Execute & Verify
      await expect(useCase.deleteObservations(request))
        .rejects.toThrow('Memory with id missing-memory not found');
      
      expect(mockRepository.findById).toHaveBeenCalledWith('missing-memory');
      expect(mockRepository.deleteObservations).not.toHaveBeenCalled();
    });

    it('should handle repository errors during deletion', async () => {
      // Setup: Memory exists but deletion fails
      const mockMemory = { id: 'mem789', name: 'Test Memory' };
      mockRepository.findById = vi.fn().mockResolvedValue(mockMemory);
      mockRepository.deleteObservations = vi.fn().mockRejectedValue(
        new Error('Database connection lost')
      );

      const request: ObservationRequest = {
        memoryId: 'mem789',
        contents: ['abcd1234efgh5678AB'] // Valid observation ID
      };

      // Execute & Verify
      await expect(useCase.deleteObservations(request))
        .rejects.toThrow('Database connection lost');
    });
  });

  describe('Batch Operations', () => {
    it('should process multiple add operations successfully', async () => {
      // Setup: Mock all memories exist
      mockRepository.findById = vi.fn().mockResolvedValue({ id: 'test', name: 'Test Memory' });
      mockRepository.addObservations = vi.fn().mockResolvedValue(undefined);

      const requests: ObservationRequest[] = [
        { memoryId: 'mem1', contents: ['Observation 1'] },
        { memoryId: 'mem2', contents: ['Observation 2', 'Observation 3'] },
        { memoryId: 'mem3', contents: ['Observation 4'] }
      ];

      // Execute
      const result = await useCase.executeMany('add', requests);

      // Verify - count actual observations: 2 + 1 + 1 = 4
      expect(result.processed).toBe(4);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.findById).toHaveBeenCalledTimes(3);
      expect(mockRepository.addObservations).toHaveBeenCalledTimes(3);
    });

    it('should process multiple delete operations successfully', async () => {
      // Setup: Mock all memories exist
      mockRepository.findById = vi.fn().mockResolvedValue({ id: 'test', name: 'Test Memory' });
      mockRepository.deleteObservations = vi.fn().mockResolvedValue(undefined);

      const requests: ObservationRequest[] = [
        { memoryId: 'mem1', contents: ['abcd1234efgh5678AB'] },  // 1 valid ID
        { memoryId: 'mem2', contents: ['wxyz9876mnop5432CD', 'efgh1234ijkl5678EF'] }  // 2 valid IDs
      ];

      // Execute
      const result = await useCase.executeMany('delete', requests);

      // Verify - count actual observations: 1 + 2 = 3
      expect(result.processed).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.deleteObservations).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure scenarios', async () => {
      // Setup: First memory exists, second doesn't, third exists
      mockRepository.findById = vi.fn()
        .mockResolvedValueOnce({ id: 'mem1', name: 'Memory 1' })
        .mockResolvedValueOnce(null) // Memory not found
        .mockResolvedValueOnce({ id: 'mem3', name: 'Memory 3' });
      
      mockRepository.addObservations = vi.fn().mockResolvedValue(undefined);

      const requests: ObservationRequest[] = [
        { memoryId: 'mem1', contents: ['Success observation'] },
        { memoryId: 'nonexistent', contents: ['Failed observation'] },
        { memoryId: 'mem3', contents: ['Another success'] }
      ];

      // Execute
      const result = await useCase.executeMany('add', requests);

      // Verify
      expect(result.processed).toBe(2); // Two successful
      expect(result.errors).toHaveLength(1); // One failed
      expect(result.errors[0]).toContain('Memory with id nonexistent not found');
      expect(mockRepository.addObservations).toHaveBeenCalledTimes(2);
    });

    it('should handle repository errors in batch operations', async () => {
      // Setup: Memory exists but operations fail randomly
      mockRepository.findById = vi.fn().mockResolvedValue({ id: 'test', name: 'Test Memory' });
      mockRepository.addObservations = vi.fn()
        .mockResolvedValueOnce(undefined) // First succeeds
        .mockRejectedValueOnce(new Error('Database timeout')) // Second fails
        .mockResolvedValueOnce(undefined); // Third succeeds

      const requests: ObservationRequest[] = [
        { memoryId: 'mem1', contents: ['Success 1'] },
        { memoryId: 'mem2', contents: ['Will fail'] },
        { memoryId: 'mem3', contents: ['Success 2'] }
      ];

      // Execute
      const result = await useCase.executeMany('add', requests);

      // Verify
      expect(result.processed).toBe(2); // Two successful
      expect(result.errors).toHaveLength(1); // One failed
      expect(result.errors[0]).toContain('Database timeout');
    });

    it('should handle empty batch operations', async () => {
      // Execute with empty requests
      const result = await useCase.executeMany('add', []);

      // Verify
      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.findById).not.toHaveBeenCalled();
      expect(mockRepository.addObservations).not.toHaveBeenCalled();
    });
  });
});
