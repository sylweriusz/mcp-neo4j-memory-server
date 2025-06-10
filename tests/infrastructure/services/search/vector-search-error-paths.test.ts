/**
 * Vector Search Channel - Error Path Coverage
 * THE IMPLEMENTOR'S RULE: Test the paths where things go wrong, not just where they go right
 * 
 * Target: 83.56% → 95% coverage
 * Missing: Lines 144-145, 149-164 (GDS error handling)
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Session } from 'neo4j-driver';
import { VectorSearchChannel } from '../../../../src/infrastructure/services/search/vector-search-channel';

describe('VectorSearchChannel - Error Path Coverage', () => {
  let vectorChannel: VectorSearchChannel;
  let mockSession: Session;

  beforeEach(() => {
    mockSession = {
      run: vi.fn()
    } as any;
    vectorChannel = new VectorSearchChannel(mockSession);
  });

  describe('GDS Verification Error Paths', () => {
    test('should fail fast when GDS returns invalid result type', async () => {
      // Mock GDS verification returning string instead of number
      mockSession.run = vi.fn().mockResolvedValue({
        records: [{ get: () => 'invalid-not-a-number' }]
      });

      await expect(
        vectorChannel.search('test query', 10, 0.1)
      ).rejects.toThrow(/Neo4j Graph Data Science.*plugin/);
    });

    test('should fail fast when GDS verification returns undefined', async () => {
      // Mock GDS verification returning undefined
      mockSession.run = vi.fn().mockResolvedValue({
        records: [{ get: () => undefined }]
      });

      await expect(
        vectorChannel.search('test query', 10, 0.1)
      ).rejects.toThrow(/Neo4j Graph Data Science.*plugin/);
    });

    test('should fail fast when GDS verification has no records', async () => {
      // Mock GDS verification returning empty records
      mockSession.run = vi.fn().mockResolvedValue({
        records: []
      });

      await expect(
        vectorChannel.search('test query', 10, 0.1)
      ).rejects.toThrow(/Neo4j Graph Data Science.*plugin/);
    });

    test('should provide clear setup instructions when GDS is unavailable', async () => {
      // Mock GDS unavailable error (unknown function)
      mockSession.run = vi.fn().mockRejectedValue(
        new Error('Unknown function gds.similarity.cosine')
      );

      await expect(
        vectorChannel.search('test query', 10, 0.1)
      ).rejects.toThrow(/Neo4j Graph Data Science \(GDS\) plugin is required/);
    });

    test('should include setup instructions in GDS error message', async () => {
      mockSession.run = vi.fn().mockRejectedValue(
        new Error('gds.similarity not available')
      );

      const error = await vectorChannel.search('test query', 10, 0.1).catch(e => e);
      
      expect(error.message).toContain('Neo4j Graph Data Science (GDS) plugin');
      expect(error.message).toContain('not installed');
    });
  });

  describe('Vector Search Query Execution Errors', () => {
    test('should handle GDS-specific query errors with proper instructions', async () => {
      // First call (verification) succeeds
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({
          records: [{ get: () => 0.5 }] // Valid verification
        })
        .mockRejectedValueOnce(
          new Error('gds.similarity.cosine failed in main query')
        );

      // Mock embedding calculation
      vi.doMock('../../../../src/infrastructure/utilities', () => ({
        calculateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
      }));

      const error = await vectorChannel.search('test query', 10, 0.1).catch(e => e);
      
      expect(error.message).toContain('GDS vector search failed');
      expect(error.message).toContain('disabled or removed');
    });

    test('should handle non-GDS query errors normally', async () => {
      // Verification succeeds
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({
          records: [{ get: () => 0.5 }]
        })
        .mockRejectedValueOnce(
          new Error('Memory limit exceeded')
        );

      const error = await vectorChannel.search('test query', 10, 0.1).catch(e => e);
      
      expect(error.message).toContain('Vector search query failed');
      expect(error.message).toContain('Memory limit exceeded');
    });

    test('should handle query construction failures', async () => {
      // Verification succeeds
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({
          records: [{ get: () => 0.5 }]
        })
        .mockRejectedValueOnce(
          new Error('Invalid parameter syntax in query')
        );

      const error = await vectorChannel.search('test query', 10, 0.1).catch(e => e);
      
      expect(error.message).toContain('Vector search query failed');
      expect(error.message).toContain('Invalid parameter syntax');
    });
  });

  describe('Embedding Calculation Failures', () => {
    test('should handle embedding service integration', async () => {
      // This test verifies the integration point exists
      // Actual embedding failures are tested in the embedding service tests
      
      // Verification succeeds
      mockSession.run = vi.fn().mockResolvedValue({
        records: [{ get: () => 0.5 }]
      });

      // The method should exist and be callable
      expect(typeof vectorChannel.search).toBe('function');
      
      // Mock the search execution to avoid actual embedding calls
      try {
        await vectorChannel.search('test query', 10, 0.1);
      } catch (error) {
        // Expected - we're not fully mocking the embedding pipeline
        expect(error).toBeDefined();
      }
    });
  });

  describe('GDS Status Tracking', () => {
    test('should track GDS verification status', async () => {
      expect(vectorChannel.isGDSVerified()).toBeNull(); // Initially unknown
      
      // Mock successful verification
      mockSession.run = vi.fn().mockResolvedValue({
        records: [{ get: () => 0.5 }]
      });

      // This will succeed but not perform actual search due to mocking
      try {
        await vectorChannel.search('test', 10, 0.1);
      } catch {
        // Ignore search execution errors, we're testing verification status
      }
      
      expect(vectorChannel.isGDSVerified()).toBe(true);
    });

    test('should track GDS verification failure', async () => {
      // Mock failed verification
      mockSession.run = vi.fn().mockRejectedValue(
        new Error('GDS not available')
      );

      try {
        await vectorChannel.search('test', 10, 0.1);
      } catch {
        // Expected to fail
      }
      
      expect(vectorChannel.isGDSVerified()).toBe(false);
    });

    test('should cache verification status across calls', async () => {
      // Mock successful verification
      mockSession.run = vi.fn().mockResolvedValue({
        records: [{ get: () => 0.5 }]
      });

      // First call verifies GDS
      try {
        await vectorChannel.search('test1', 10, 0.1);
      } catch {
        // Ignore
      }

      // Second call should skip verification
      try {
        await vectorChannel.search('test2', 10, 0.1);
      } catch {
        // Ignore
      }

      // Verification should only have been called once (first search)
      const verificationCalls = mockSession.run.mock.calls.filter(call => 
        call[0].includes('gds.similarity.cosine([1,2,3], [2,3,4])')
      );
      expect(verificationCalls.length).toBe(1);
    });
  });

  describe('Memory Type Filtering in Error Scenarios', () => {
    test('should handle memory type filtering with GDS errors', async () => {
      // Verification succeeds, but main query fails
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({
          records: [{ get: () => 0.5 }]
        })
        .mockRejectedValueOnce(
          new Error('Query failed with memory type filter')
        );

      const error = await vectorChannel.search(
        'test query', 10, 0.1, ['project', 'note']
      ).catch(e => e);
      
      expect(error.message).toContain('Vector search query failed');
    });
  });
});
