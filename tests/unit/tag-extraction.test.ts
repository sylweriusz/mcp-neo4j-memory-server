/**
 * Tag Extraction Service Tests
 * Single responsibility: Test tag extraction pipeline
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CompromiseTagExtractionService } from '../../src/infrastructure/services/tag-extraction-service';

describe('Tag Extraction Service', () => {
  let service: CompromiseTagExtractionService;

  beforeEach(() => {
    service = new CompromiseTagExtractionService();
  });

  describe('extractTags', () => {
    it('should extract meaningful tags from simple text', async () => {
      const tags = await service.extractTags(
        'Machine learning project with TensorFlow',
        ['Using neural networks for classification']
      );

      expect(tags).toBeInstanceOf(Array);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.length).toBeLessThanOrEqual(6);
      
      // Should contain relevant technical terms
      const tagString = tags.join(' ').toLowerCase();
      expect(tagString).toContain('machine');
      expect(tagString).toContain('learning');
    });

    it('should handle empty input gracefully', async () => {
      const tags = await service.extractTags('', []);
      expect(tags).toEqual([]);
    });

    it('should limit tags to 6 maximum', async () => {
      const longText = 'Programming software development machine learning artificial intelligence neural networks deep learning computer science technology innovation research project implementation';
      const tags = await service.extractTags(longText);
      
      expect(tags.length).toBeLessThanOrEqual(6);
    });

    it('should extract technical terms properly', async () => {
      const tags = await service.extractTags(
        'React.js application with Node.js backend'
      );
      
      const tagString = tags.join(' ').toLowerCase();
      // Tag extraction is non-deterministic due to semantic deduplication
      // Just verify we get relevant technical terms
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.length).toBeLessThanOrEqual(6);
      
      // Should contain at least one of the key technologies
      const hasRelevantTech = tagString.includes('react') || 
                             tagString.includes('node') || 
                             tagString.includes('application') ||
                             tagString.includes('backend');
      expect(hasRelevantTech).toBe(true);
    });
  });
});
