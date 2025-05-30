/**
 * Observation Domain Entity Tests
 * Single responsibility: Verify Observation entity validation and behavior
 */
import { describe, it, expect } from 'vitest';
import { Observation } from '../../src/domain/entities/observation';

describe('Observation Entity', () => {
  const validObservationData = {
    id: 'Bm>test123456789ab',
    content: 'Test Observation Content',
    createdAt: new Date(),
    source: 'test',
    confidence: 0.9
  };

  describe('constructor validation', () => {
    it('should create valid observation with all fields', () => {
      const observation = new Observation(
        validObservationData.id,
        validObservationData.content,
        validObservationData.createdAt,
        validObservationData.source,
        validObservationData.confidence
      );

      expect(observation.id).toBe(validObservationData.id);
      expect(observation.content).toBe(validObservationData.content);
      expect(observation.createdAt).toBe(validObservationData.createdAt);
      expect(observation.source).toBe(validObservationData.source);
      expect(observation.confidence).toBe(validObservationData.confidence);
    });

    it('should create valid observation with only required fields', () => {
      const observation = new Observation(
        validObservationData.id,
        validObservationData.content
      );

      expect(observation.id).toBe(validObservationData.id);
      expect(observation.content).toBe(validObservationData.content);
      expect(observation.createdAt).toBeInstanceOf(Date);
      expect(observation.source).toBeUndefined();
      expect(observation.confidence).toBeUndefined();
    });

    it('should reject invalid ID length', () => {
      expect(() => {
        new Observation(
          'short', // Invalid ID length
          validObservationData.content
        );
      }).toThrow('Observation ID must be exactly 18 characters');
    });

    it('should reject empty content', () => {
      expect(() => {
        new Observation(
          validObservationData.id,
          '' // Empty content
        );
      }).toThrow('Observation content is required');
    });

    it('should reject whitespace-only content', () => {
      expect(() => {
        new Observation(
          validObservationData.id,
          '   ' // Whitespace-only content
        );
      }).toThrow('Observation content is required');
    });

    it('should reject confidence below 0', () => {
      expect(() => {
        new Observation(
          validObservationData.id,
          validObservationData.content,
          new Date(),
          'test',
          -0.1 // Confidence below 0
        );
      }).toThrow('Observation confidence must be between 0 and 1');
    });

    it('should reject confidence above 1', () => {
      expect(() => {
        new Observation(
          validObservationData.id,
          validObservationData.content,
          new Date(),
          'test',
          1.1 // Confidence above 1
        );
      }).toThrow('Observation confidence must be between 0 and 1');
    });
  });

  describe('business methods', () => {
    it('should identify high confidence observations', () => {
      const highConfidence = new Observation(
        validObservationData.id,
        validObservationData.content,
        new Date(),
        'test',
        0.8 // Exactly at threshold
      );
      
      const veryHighConfidence = new Observation(
        validObservationData.id,
        validObservationData.content,
        new Date(),
        'test',
        0.9 // Above threshold
      );
      
      const lowConfidence = new Observation(
        validObservationData.id,
        validObservationData.content,
        new Date(),
        'test',
        0.7 // Below threshold
      );
      
      const noConfidence = new Observation(
        validObservationData.id,
        validObservationData.content
        // No confidence specified
      );
      
      expect(highConfidence.isHighConfidence()).toBe(true);
      expect(veryHighConfidence.isHighConfidence()).toBe(true);
      expect(lowConfidence.isHighConfidence()).toBe(false);
      expect(noConfidence.isHighConfidence()).toBe(false);
    });

    it('should return correct content length', () => {
      const shortContent = new Observation(
        validObservationData.id,
        'Short'
      );
      
      const longContent = new Observation(
        validObservationData.id,
        'This is a much longer observation content for testing the length calculation'
      );
      
      expect(shortContent.getContentLength()).toBe(5);
      expect(longContent.getContentLength()).toBe(76);
    });
  });
});
