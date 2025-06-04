/**
 * ExactSearchChannel - Simplified Tests
 * Tests for the current FULLTEXT implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExactSearchChannel } from '../../../../src/infrastructure/services/search/exact-search-channel';

describe('ExactSearchChannel - Current Implementation Tests', () => {
  let channel: ExactSearchChannel;
  let mockSession: any;

  beforeEach(() => {
    mockSession = {
      run: vi.fn()
    };
    channel = new ExactSearchChannel(mockSession);
  });

  describe('FULLTEXT Search Implementation', () => {
    it('should use FULLTEXT indexes for search', async () => {
      // Mock all search calls to return empty results
      mockSession.run.mockResolvedValue({ records: [] });

      await channel.search('test query', 10);

      // Should call FULLTEXT search for metadata
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining("CALL db.index.fulltext.queryNodes('memory_metadata_idx'"),
        expect.objectContaining({
          query: 'test query'
        })
      );

      // Should call FULLTEXT search for content
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining("CALL db.index.fulltext.queryNodes('observation_content_idx'"),
        expect.objectContaining({
          query: 'test query'
        })
      );

      // Should call regular search for names
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE toLower(m.name) CONTAINS'),
        expect.objectContaining({
          query: 'test query'
        })
      );
    });

    it('should handle memory type filtering', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await channel.search('test', 10, ['project', 'note']);

      // All calls should include memoryTypes parameter
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          memoryTypes: ['project', 'note']
        })
      );
    });

    it('should combine results from different sources', async () => {
      // Mock different searches to return different results
      const metadataResult = {
        records: [{
          get: vi.fn().mockImplementation((key) => {
            switch (key) {
              case 'id': return 'meta-id';
              case 'name': return 'Metadata Match';
              case 'metadata': return '{"test": "data"}';
              default: return null;
            }
          })
        }]
      };

      const nameResult = {
        records: [{
          get: vi.fn().mockImplementation((key) => {
            switch (key) {
              case 'id': return 'name-id';
              case 'name': return 'Name Match';
              case 'metadata': return '{}';
              case 'exactNameMatch': return true;
              default: return null;
            }
          })
        }]
      };

      const emptyResult = { records: [] };

      mockSession.run
        .mockResolvedValueOnce(metadataResult)  // metadata search
        .mockResolvedValueOnce(emptyResult)     // content search
        .mockResolvedValueOnce(nameResult);     // name search

      const results = await channel.search('test', 10);

      expect(results).toHaveLength(2);
      expect(results.some(r => r.id === 'meta-id')).toBe(true);
      expect(results.some(r => r.id === 'name-id')).toBe(true);
    });

    it('should handle Lucene query sanitization', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      // Test with special Lucene characters
      await channel.search('test+query:special', 10);

      // Should sanitize the query for FULLTEXT calls
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CALL db.index.fulltext.queryNodes'),
        expect.objectContaining({
          query: 'test\\+query\\:special'  // Escaped special characters
        })
      );
    });

    it('should handle empty results gracefully', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const results = await channel.search('nonexistent', 10);

      expect(results).toHaveLength(0);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
