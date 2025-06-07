/**
 * Query Classifier Tests - Simplified Version
 * Testing simplified query classification (wildcard, exact, semantic only)
 */

import { QueryClassifier, QueryType } from '../../../../src/infrastructure/services/search/query-classifier';

describe('QueryClassifier', () => {
  const classifier = new QueryClassifier();

  describe('Wildcard Query Detection', () => {
    it('should classify "*" as wildcard', () => {
      const result = classifier.classify('*');
      
      expect(result.type).toBe(QueryType.WILDCARD);
      expect(result.confidence).toBe(1.0);
      expect(result.preprocessing.normalized).toBe('*');
    });

    it('should classify "all" as wildcard', () => {
      const result = classifier.classify('all');
      
      expect(result.type).toBe(QueryType.WILDCARD);
      expect(result.confidence).toBe(1.0);
      expect(result.preprocessing.normalized).toBe('all');
    });
  });

  describe('Exact Search Pattern Detection', () => {
    const exactSearchQueries = [
      '123',          // Numbers only
      '!@#$%',        // Symbols only
      '123.456',      // Decimal number
      '()[]{}',       // Brackets only
      '+-*/',         // Math operators
    ];

    exactSearchQueries.forEach(query => {
      it(`should classify "${query}" as exact search (no letters)`, () => {
        const result = classifier.classify(query);
        
        expect(result.type).toBe(QueryType.EXACT_SEARCH);
        expect(result.confidence).toBe(0.9);
      });
    });
  });

  describe('Semantic Search Detection', () => {
    const semanticQueries = [
      'machine learning',
      'project status',
      'how to implement search',
      'user authentication system',
      'database optimization',
      'api documentation',
      'mixed123text',
      'version 1.0 release notes'
    ];

    semanticQueries.forEach(query => {
      it(`should classify "${query}" as semantic search`, () => {
        const result = classifier.classify(query);
        
        expect(result.type).toBe(QueryType.SEMANTIC_SEARCH);
        expect(result.confidence).toBe(0.8);
        expect(result.preprocessing.normalized).toBe(query.toLowerCase());
      });
    });
  });

  describe('Query Preprocessing', () => {
    it('should normalize to lowercase', () => {
      const result = classifier.classify('MACHINE LEARNING');
      
      expect(result.preprocessing.normalized).toBe('machine learning');
    });

    it('should handle query trimming', () => {
      const result = classifier.classify('  trimmed query  ');
      
      expect(result.preprocessing.normalized).toBe('trimmed query');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queries', () => {
      expect(() => classifier.classify('')).toThrow('Query must be a non-empty string');
    });

    it('should handle null/undefined', () => {
      expect(() => classifier.classify(null as any)).toThrow('Query must be a non-empty string');
      expect(() => classifier.classify(undefined as any)).toThrow('Query must be a non-empty string');
    });
  });

  describe('Classification Confidence', () => {
    it('should maintain confidence hierarchy', () => {
      const wildcard = classifier.classify('*');
      const exact = classifier.classify('123');
      const semantic = classifier.classify('text query');

      // Confidence hierarchy: wildcard > exact > semantic
      expect(wildcard.confidence).toBeGreaterThan(exact.confidence);
      expect(exact.confidence).toBeGreaterThan(semantic.confidence);
    });
  });
});
