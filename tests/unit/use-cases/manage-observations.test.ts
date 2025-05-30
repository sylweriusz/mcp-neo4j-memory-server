/**
 * Manage Observations Use Case Tests
 * Single responsibility: Test observation management with tag re-extraction (BUG #2 FIX)
 * THE IMPLEMENTOR'S RULE: Test the crime scene, not the evidence
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageObservationsUseCase, ObservationRequest } from '../../../src/application/use-cases/manage-observations';

describe('ManageObservationsUseCase', () => {
  let observationUseCase: ManageObservationsUseCase;
  let mockMemoryRepository: any;
  let mockTagExtractionService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockMemoryRepository = {
      findById: vi.fn(),
      addObservations: vi.fn(),
      deleteObservations: vi.fn(),
      update: vi.fn()
    };

    mockTagExtractionService = {
      extractTagsForMemory: vi.fn()
    };

    observationUseCase = new ManageObservationsUseCase(
      mockMemoryRepository,
      mockTagExtractionService
    );
  });

  describe('Add Observations - BUG #2 FIX', () => {
    it('should add observations and re-extract tags with temporal drift', async () => {
      const request: ObservationRequest = {
        memoryId: 'Bm>test1234567890123',
        contents: ['New observation about machine learning', 'Deep learning concepts']
      };

      const initialMemory = {
        id: 'Bm>test1234567890123',
        name: 'AI Research',
        memoryType: 'research',
        tags: ['ai', 'research'],
        observations: []
      };

      const updatedMemory = {
        id: 'Bm>test1234567890123',
        name: 'AI Research',
        memoryType: 'research',
        tags: ['ai', 'research'],
        observations: [
          { content: 'New observation about machine learning', createdAt: '2025-05-28T10:00:00Z' },
          { content: 'Deep learning concepts', createdAt: '2025-05-28T10:01:00Z' }
        ]
      };

      const newTags = ['ai', 'research', 'machine-learning', 'deep-learning'];

      mockMemoryRepository.findById
        .mockResolvedValueOnce(initialMemory)
        .mockResolvedValueOnce(updatedMemory);
      
      mockTagExtractionService.extractTagsForMemory.mockResolvedValue(newTags);

      await observationUseCase.addObservations(request);

      // Verify observations are added first
      expect(mockMemoryRepository.addObservations).toHaveBeenCalledWith(
        'Bm>test1234567890123',
        ['New observation about machine learning', 'Deep learning concepts']
      );

      // Verify tag re-extraction with temporal drift flag
      expect(mockTagExtractionService.extractTagsForMemory).toHaveBeenCalledWith(
        'AI Research',
        ['New observation about machine learning', 'Deep learning concepts'],
        ['ai', 'research'],
        true // isAddingNewObservations flag for temporal drift
      );

      // Verify memory update with new tags
      expect(mockMemoryRepository.update).toHaveBeenCalledWith({
        ...updatedMemory,
        tags: newTags,
        modifiedAt: expect.any(String)
      });
    });

    it('should not update memory when tags unchanged', async () => {
      const request: ObservationRequest = {
        memoryId: 'Bm>test1234567890123',
        contents: ['Simple observation']
      };

      const initialMemory = {
        id: 'Bm>test1234567890123',
        name: 'Test Memory',
        memoryType: 'test',
        tags: ['test', 'memory'],
        observations: []
      };

      const updatedMemory = {
        ...initialMemory,
        observations: [{ content: 'Simple observation', createdAt: '2025-05-28T10:00:00Z' }]
      };

      // Tag extraction returns same tags
      const sameTags = ['test', 'memory'];

      mockMemoryRepository.findById
        .mockResolvedValueOnce(initialMemory)
        .mockResolvedValueOnce(updatedMemory);
      
      mockTagExtractionService.extractTagsForMemory.mockResolvedValue(sameTags);

      await observationUseCase.addObservations(request);

      expect(mockMemoryRepository.addObservations).toHaveBeenCalled();
      expect(mockTagExtractionService.extractTagsForMemory).toHaveBeenCalled();
      expect(mockMemoryRepository.update).not.toHaveBeenCalled();
    });

    it('should handle tag extraction failures gracefully', async () => {
      const request: ObservationRequest = {
        memoryId: 'Bm>test1234567890123',
        contents: ['Test observation']
      };

      const mockMemory = {
        id: 'Bm>test1234567890123',
        name: 'Test Memory',
        memoryType: 'test',
        tags: ['existing'],
        observations: []
      };

      mockMemoryRepository.findById.mockResolvedValue(mockMemory);
      mockTagExtractionService.extractTagsForMemory.mockRejectedValue(new Error('Tag extraction failed'));

      // Should not throw - observation addition should succeed
      await expect(observationUseCase.addObservations(request)).resolves.toBeUndefined();

      expect(mockMemoryRepository.addObservations).toHaveBeenCalled();
      expect(mockMemoryRepository.update).not.toHaveBeenCalled();
    });

    it('should reject requests for non-existent memory', async () => {
      const request: ObservationRequest = {
        memoryId: 'Bm>nonexistent',
        contents: ['Test observation']
      };

      mockMemoryRepository.findById.mockResolvedValue(null);

      await expect(observationUseCase.addObservations(request)).rejects.toThrow(
        'Memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.addObservations).not.toHaveBeenCalled();
    });
  });

  describe('Delete Observations', () => {
    it('should delete observations by ID', async () => {
      const request: ObservationRequest = {
        memoryId: 'Bm>test1234567890123',
        contents: ['Bm>obs123456789012', 'Bm>obs123456789013'] // Observation IDs
      };

      const mockMemory = {
        id: 'Bm>test1234567890123',
        name: 'Test Memory',
        memoryType: 'test',
        tags: ['test'],
        observations: []
      };

      mockMemoryRepository.findById.mockResolvedValue(mockMemory);

      await observationUseCase.deleteObservations(request);

      expect(mockMemoryRepository.findById).toHaveBeenCalledWith('Bm>test1234567890123');
      expect(mockMemoryRepository.deleteObservations).toHaveBeenCalledWith(
        'Bm>test1234567890123',
        ['Bm>obs123456789012', 'Bm>obs123456789013']
      );
    });

    it('should reject deletion for non-existent memory', async () => {
      const request: ObservationRequest = {
        memoryId: 'Bm>nonexistent',
        contents: ['Bm>obs123456789012']
      };

      mockMemoryRepository.findById.mockResolvedValue(null);

      await expect(observationUseCase.deleteObservations(request)).rejects.toThrow(
        'Memory with id Bm>nonexistent not found'
      );

      expect(mockMemoryRepository.deleteObservations).not.toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    it('should execute multiple add operations', async () => {
      const requests: ObservationRequest[] = [
        { memoryId: 'Bm>memory1', contents: ['Observation 1'] },
        { memoryId: 'Bm>memory2', contents: ['Observation 2'] }
      ];

      const mockMemory = {
        id: 'Bm>memory1',
        name: 'Memory 1',
        memoryType: 'test',
        tags: ['test'],
        observations: []
      };

      mockMemoryRepository.findById.mockResolvedValue(mockMemory);

      const result = await observationUseCase.executeMany('add', requests);

      expect(result.processed).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockMemoryRepository.addObservations).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success/failure in batch operations', async () => {
      const requests: ObservationRequest[] = [
        { memoryId: 'Bm>exists', contents: ['Good observation'] },
        { memoryId: 'Bm>nonexistent', contents: ['Bad observation'] }
      ];

      mockMemoryRepository.findById
        .mockResolvedValueOnce({ id: 'Bm>exists', name: 'Exists', memoryType: 'test', tags: [] })
        .mockResolvedValueOnce(null);

      const result = await observationUseCase.executeMany('add', requests);

      expect(result.processed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to add observations for memory Bm>nonexistent');
    });
  });
});
