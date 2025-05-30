/**
 * Metadata Search Service Tests - Phase 2C Priority 3
 * The literal detective - finding exact matches in the chaos
 * 
 * HUNT TARGET: Exact matching and fulltext search operations
 * THREAT LEVEL: Medium - Standard search operations with fallback patterns
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataSearchService } from '../../../../src/infrastructure/services/search/metadata-search-service';
import neo4j from 'neo4j-driver';

describe('MetadataSearchService - The Literal Detective', () => {
  let metadataService: MetadataSearchService;
  let mockSession: any;

  beforeEach(() => {
    // Mock Neo4j session
    mockSession = {
      run: vi.fn()
    };

    metadataService = new MetadataSearchService(mockSession);
  });

  describe('Exact Match Search - The Precise Hunter', () => {
    it('should find exact matches in memory names and metadata', async () => {
      // Setup: Mock exact match results
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValueOnce('mem1').mockReturnValueOnce('Machine Learning') },
          { get: vi.fn().mockReturnValueOnce('mem2').mockReturnValueOnce('Deep Learning') }
        ]
      });

      // Execute
      const result = await metadataService.searchByMetadata('learning', 10);

      // Verify: Exact search query structure
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[0]).toContain('CONTAINS $query');
      expect(queryCall[1].query).toBe('learning');
      expect(result.exactMatches).toEqual(['mem1', 'mem2']);
    });

    it('should apply memory type filtering to exact matches', async () => {
      // Setup: Mock filtered results
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValueOnce('proj1').mockReturnValueOnce('ML Project') }
        ]
      });

      // Execute with memory type filter
      const result = await metadataService.searchByMetadata(
        'project', 5, ['project', 'research']
      );

      // Verify: Memory type filter applied
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[0]).toContain('m.memoryType IN $memoryTypes');
      expect(queryCall[1].memoryTypes).toEqual(['project', 'research']);
      expect(result.exactMatches).toEqual(['proj1']);
    });

    it('should handle case insensitive search', async () => {
      // Setup: Mock case insensitive results
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValueOnce('mem1').mockReturnValueOnce('Python Programming') }
        ]
      });

      // Execute with mixed case query
      const result = await metadataService.searchByMetadata('PYTHON', 10);

      // Verify: Query lowercased
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[1].query).toBe('python');
      expect(result.exactMatches).toEqual(['mem1']);
    });

    it('should respect limit parameter in exact search', async () => {
      // Setup: Mock many results
      const manyRecords = Array(20).fill(null).map((_, i) => ({
        get: vi.fn().mockReturnValueOnce(`mem${i}`).mockReturnValueOnce(`Result ${i}`)
      }));
      
      mockSession.run.mockResolvedValue({ records: manyRecords });

      // Execute with small limit
      const result = await metadataService.searchByMetadata('test', 3);

      // Verify: Limit applied
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[1].limit.toNumber()).toBe(3);
    });

    it('should handle empty query gracefully', async () => {
      // Setup: Empty query
      mockSession.run.mockResolvedValue({ records: [] });

      // Execute
      const result = await metadataService.searchByMetadata('', 10);

      // Verify: Empty results
      expect(result.exactMatches).toEqual([]);
    });
  });

  describe('Fulltext Search Integration - The Deep Searcher', () => {
    it('should use fulltext index when available', async () => {
      // Setup: Mock successful fulltext search
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValue('mem1') },
          { get: vi.fn().mockReturnValue('mem2') }
        ]
      });

      // Execute
      const result = await metadataService.searchByMetadata('neural networks', 10);

      // Verify: Fulltext index query used
      const fulltextCall = mockSession.run.mock.calls[1]; // Second call is fulltext
      expect(fulltextCall[0]).toContain('db.index.fulltext.queryNodes');
      expect(fulltextCall[0]).toContain('memory_metadata_idx');
      expect(fulltextCall[1].query).toBe('neural networks');
      expect(result.fulltextMatches).toEqual(['mem1', 'mem2']);
    });

    it('should apply memory type filtering to fulltext search', async () => {
      // Setup: Mock fulltext with type filtering
      mockSession.run
        .mockResolvedValueOnce({ records: [] }) // Exact search
        .mockResolvedValueOnce({ // Fulltext search
          records: [
            { get: vi.fn().mockReturnValue('research1') }
          ]
        });

      // Execute with memory type filter
      const result = await metadataService.searchByMetadata(
        'algorithm', 5, ['research']
      );

      // Verify: Type filter in fulltext query
      const fulltextCall = mockSession.run.mock.calls[1];
      expect(fulltextCall[0]).toContain('node.memoryType IN $memoryTypes');
      expect(fulltextCall[1].memoryTypes).toEqual(['research']);
      expect(result.fulltextMatches).toEqual(['research1']);
    });

    it('should fallback to CONTAINS when fulltext index unavailable', async () => {
      // Setup: Exact search succeeds, fulltext fails
      mockSession.run
        .mockResolvedValueOnce({ records: [] }) // Exact search
        .mockRejectedValueOnce(new Error('Fulltext index not available')); // Fulltext fails

      // Mock fallback exact search for fulltext
      mockSession.run.mockResolvedValueOnce({
        records: [
          { get: vi.fn().mockReturnValue('fallback1') }
        ]
      });

      // Execute
      const result = await metadataService.searchByMetadata('fallback test', 10);

      // Verify: Fallback to exact search
      expect(mockSession.run).toHaveBeenCalledTimes(3); // exact + fulltext fail + fallback
      expect(result.fulltextMatches).toEqual(['fallback1']);
    });

    it('should handle fulltext query syntax gracefully', async () => {
      // Setup: Complex query with special characters
      mockSession.run
        .mockResolvedValueOnce({ records: [] }) // Exact search
        .mockResolvedValueOnce({ // Fulltext search
          records: [
            { get: vi.fn().mockReturnValue('special1') }
          ]
        });

      // Execute with special characters
      const result = await metadataService.searchByMetadata('C++ && algorithms', 10);

      // Verify: Query passed through to fulltext
      const fulltextCall = mockSession.run.mock.calls[1];
      expect(fulltextCall[1].query).toBe('C++ && algorithms');
      expect(result.fulltextMatches).toEqual(['special1']);
    });
  });

  describe('Tag-Based Search - The Keyword Hunter', () => {
    it('should extract words from query for tag matching', async () => {
      // Setup: Mock tag search results
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValue('tagged1') },
          { get: vi.fn().mockReturnValue('tagged2') }
        ]
      });

      // Execute with multi-word query
      const result = await metadataService.searchByTags('machine learning algorithms', 10);

      // Verify: Words extracted and used
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[1].queryWords).toEqual(['machine', 'learning', 'algorithms']);
      expect(result).toEqual(['tagged1', 'tagged2']);
    });

    it('should filter out short words from tag search', async () => {
      // Setup: Mock tag search
      mockSession.run.mockResolvedValue({ records: [] });

      // Execute with short words
      const result = await metadataService.searchByTags('a big ML to go', 10);

      // Verify: Short words filtered out
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[1].queryWords).toEqual(['big']);
    });

    it('should handle empty tag query gracefully', async () => {
      // Setup: Empty query words
      mockSession.run.mockResolvedValue({ records: [] });

      // Execute with only short words
      const result = await metadataService.searchByTags('a to is', 10);

      // Verify: Empty results without database call
      expect(result).toEqual([]);
      expect(mockSession.run).not.toHaveBeenCalled();
    });

    it('should apply memory type filtering to tag search', async () => {
      // Setup: Mock tag search with filtering
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValue('tagged_project') }
        ]
      });

      // Execute with memory type filter
      const result = await metadataService.searchByTags(
        'python programming', 5, ['project']
      );

      // Verify: Memory type filter applied
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[0]).toContain('m.memoryType IN $memoryTypes');
      expect(queryCall[1].memoryTypes).toEqual(['project']);
      expect(result).toEqual(['tagged_project']);
    });

    it('should handle case insensitive tag matching', async () => {
      // Setup: Mock case insensitive tag search
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValue('case_test') }
        ]
      });

      // Execute with mixed case
      const result = await metadataService.searchByTags('Python JavaScript', 10);

      // Verify: Query words lowercased
      const queryCall = mockSession.run.mock.calls[0];
      expect(queryCall[1].queryWords).toEqual(['python', 'javascript']);
      expect(result).toEqual(['case_test']);
    });
  });

  describe('Error Recovery - The Resilient Investigator', () => {
    it('should handle database connection failures gracefully', async () => {
      // Setup: Database failure
      mockSession.run.mockRejectedValue(new Error('Database connection lost'));

      // Execute
      const result = await metadataService.searchByMetadata('test', 10);

      // Verify: Graceful failure with empty results
      expect(result.exactMatches).toEqual([]);
      expect(result.fulltextMatches).toEqual([]);
    });

    it('should handle partial failures in search pipeline', async () => {
      // Setup: Exact search succeeds, fulltext fails
      mockSession.run
        .mockResolvedValueOnce({ // Exact search succeeds
          records: [{ get: vi.fn().mockReturnValue('exact1') }]
        })
        .mockRejectedValueOnce(new Error('Fulltext failed')); // Fulltext fails

      // Mock fallback succeeds
      mockSession.run.mockResolvedValueOnce({
        records: [{ get: vi.fn().mockReturnValue('fallback1') }]
      });

      // Execute
      const result = await metadataService.searchByMetadata('test', 10);

      // Verify: Partial results returned
      expect(result.exactMatches).toEqual(['exact1']);
      expect(result.fulltextMatches).toEqual(['fallback1']);
    });

    it('should handle malformed query results', async () => {
      // Setup: Malformed Neo4j results
      mockSession.run.mockResolvedValue({
        records: [
          { get: vi.fn().mockReturnValue(null) }, // Null ID
          { get: vi.fn().mockReturnValue(undefined) }, // Undefined ID
          { get: vi.fn().mockReturnValue('valid1') } // Valid ID
        ]
      });

      // Execute
      const result = await metadataService.searchByMetadata('test', 10);

      // Verify: Only valid results included
      expect(result.exactMatches).toEqual(['valid1']);
    });

    it('should handle tag search failures gracefully', async () => {
      // Setup: Tag search failure
      mockSession.run.mockRejectedValue(new Error('Tag search failed'));

      // Execute
      const result = await metadataService.searchByTags('test keywords', 10);

      // Verify: Empty results without propagating error
      expect(result).toEqual([]);
    });
  });

  describe('Integration Scenarios - The Complete Investigation', () => {
    it('should coordinate exact and fulltext searches properly', async () => {
      // Setup: Both searches return different results
      mockSession.run
        .mockResolvedValueOnce({ // Exact search
          records: [
            { get: vi.fn().mockReturnValueOnce('exact1').mockReturnValueOnce('Exact Match') }
          ]
        })
        .mockResolvedValueOnce({ // Fulltext search
          records: [
            { get: vi.fn().mockReturnValue('fulltext1') }
          ]
        });

      // Execute
      const result = await metadataService.searchByMetadata('search test', 10);

      // Verify: Both result types returned
      expect(result.exactMatches).toEqual(['exact1']);
      expect(result.fulltextMatches).toEqual(['fulltext1']);
      expect(mockSession.run).toHaveBeenCalledTimes(2);
    });

    it('should handle overlapping results between exact and fulltext', async () => {
      // Setup: Overlapping results
      mockSession.run
        .mockResolvedValueOnce({ // Exact search
          records: [
            { get: vi.fn().mockReturnValueOnce('overlap1').mockReturnValueOnce('Test') },
            { get: vi.fn().mockReturnValueOnce('exact_only').mockReturnValueOnce('Exact') }
          ]
        })
        .mockResolvedValueOnce({ // Fulltext search
          records: [
            { get: vi.fn().mockReturnValue('overlap1') }, // Same as exact
            { get: vi.fn().mockReturnValue('fulltext_only') }
          ]
        });

      // Execute
      const result = await metadataService.searchByMetadata('test', 10);

      // Verify: All results included (deduplication handled by orchestrator)
      expect(result.exactMatches).toEqual(['overlap1', 'exact_only']);
      expect(result.fulltextMatches).toEqual(['overlap1', 'fulltext_only']);
    });

    it('should maintain performance with large result sets', async () => {
      // Setup: Large result set
      const largeExactResults = Array(100).fill(null).map((_, i) => ({
        get: vi.fn().mockReturnValueOnce(`exact${i}`).mockReturnValueOnce(`Name ${i}`)
      }));
      
      const largeFulltextResults = Array(100).fill(null).map((_, i) => ({
        get: vi.fn().mockReturnValue(`fulltext${i}`)
      }));

      mockSession.run
        .mockResolvedValueOnce({ records: largeExactResults })
        .mockResolvedValueOnce({ records: largeFulltextResults });

      // Execute with reasonable limit
      const result = await metadataService.searchByMetadata('large dataset', 50);

      // Verify: Limits properly applied in queries
      expect(mockSession.run.mock.calls[0][1].limit.toNumber()).toBe(50);
      expect(mockSession.run.mock.calls[1][1].limit.toNumber()).toBe(50);
    });
  });
});
