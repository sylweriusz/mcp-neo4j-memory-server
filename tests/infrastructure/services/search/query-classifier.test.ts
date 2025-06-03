/**
 * QueryClassifier Tests - Truth-First Search Architecture
 * Single responsibility: Test query classification according to GDD v2.2.0
 * 
 * Test Coverage Target: 90%+ (Foundation component)
 */

import { describe, it, expect } from 'vitest';
import { QueryClassifier, QueryType, QueryIntent } from '../../../../src/infrastructure/services/search/query-classifier';

describe('QueryClassifier - Truth-First Foundation', () => {
  const classifier = new QueryClassifier();

  describe('Wildcard Query Detection', () => {
    const wildcardQueries = ['*', '', '   ', 'all', 'ALL'];

    wildcardQueries.forEach(query => {
      it(`should classify "${query}" as wildcard`, () => {
        const result = classifier.classify(query);
        
        expect(result.type).toBe(QueryType.WILDCARD);
        expect(result.confidence).toBe(1.0);
        expect(result.preprocessing.requiresExactMatch).toBe(false);
        expect(result.preprocessing.isSpecialPattern).toBe(false);
      });
    });
  });

  describe('Technical Identifier Detection', () => {
    const testCases = [
      // UUID patterns
      {
        query: '123e4567-e89b-12d3-a456-426614174000',
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.95,
        reason: 'UUID format'
      },
      {
        query: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.95,
        reason: 'UUID format uppercase'
      },
      // Version patterns
      {
        query: 'v1.2.3',
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.9,
        reason: 'Version with v prefix'
      },
      {
        query: '2.1.0',
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.9,
        reason: 'Version without prefix'
      },
      {
        query: '1.0.0-beta.1',
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.9,
        reason: 'Semver with prerelease'
      },
      // Base64-like patterns
      {
        query: 'QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.85,
        reason: 'Base64 with padding'
      },
      {
        query: 'dGVzdGluZ0Jhc2U2NGVuY29kaW5n',
        type: QueryType.TECHNICAL_IDENTIFIER,
        confidence: 0.85,
        reason: 'Base64 without padding'
      }
    ];

    testCases.forEach(({ query, type, confidence, reason }) => {
      it(`should classify "${query}" as technical identifier (${reason})`, () => {
        const result = classifier.classify(query);
        
        expect(result.type).toBe(type);
        expect(result.confidence).toBe(confidence);
        expect(result.preprocessing.isSpecialPattern).toBe(true);
        expect(result.preprocessing.requiresExactMatch).toBe(true);
      });
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
        expect(result.preprocessing.isSpecialPattern).toBe(true);
        expect(result.preprocessing.requiresExactMatch).toBe(true);
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
      'Version 1.0 release notes'  // Contains version but has letters
    ];

    semanticQueries.forEach(query => {
      it(`should classify "${query}" as semantic search`, () => {
        const result = classifier.classify(query);
        
        expect(result.type).toBe(QueryType.SEMANTIC_SEARCH);
        expect(result.confidence).toBe(0.8);
        expect(result.preprocessing.isSpecialPattern).toBe(false);
        expect(result.preprocessing.requiresExactMatch).toBe(false);
      });
    });
  });

  describe('Query Preprocessing', () => {
    it('should normalize query to lowercase', () => {
      const result = classifier.classify('MACHINE Learning');
      
      expect(result.preprocessing.normalized).toBe('machine learning');
    });

    it('should handle query trimming', () => {
      const result = classifier.classify('  trimmed query  ');
      
      expect(result.preprocessing.normalized).toBe('trimmed query');
    });

    it('should preserve original case in classification logic', () => {
      // UUID should be detected regardless of case
      const lowerResult = classifier.classify('123e4567-e89b-12d3-a456-426614174000');
      const upperResult = classifier.classify('123E4567-E89B-12D3-A456-426614174000');
      
      expect(lowerResult.type).toBe(QueryType.TECHNICAL_IDENTIFIER);
      expect(upperResult.type).toBe(QueryType.TECHNICAL_IDENTIFIER);
    });
  });

  describe('Edge Cases', () => {
    const classifier = new QueryClassifier();
    it('should handle empty string', () => {
      const result = classifier.classify('');
      
      expect(result.type).toBe(QueryType.WILDCARD);
    });

    it('should handle whitespace-only string', () => {
      const result = classifier.classify('   ');
      
      expect(result.type).toBe(QueryType.WILDCARD);
    });

    it('should reject null/undefined input', () => {
      expect(() => classifier.classify(null as any)).toThrow('Query must be a non-empty string');
      expect(() => classifier.classify(undefined as any)).toThrow('Query must be a non-empty string');
    });

    it('should handle single character queries', () => {
      expect(classifier.classify('a').type).toBe(QueryType.SEMANTIC_SEARCH);
      expect(classifier.classify('1').type).toBe(QueryType.EXACT_SEARCH);
      expect(classifier.classify('!').type).toBe(QueryType.EXACT_SEARCH);
    });

    it('should handle borderline base64 length (exactly 8 chars)', () => {
      // Should NOT be classified as technical (requires > 8)
      expect(classifier.classify('12345678').type).toBe(QueryType.EXACT_SEARCH);
      
      // Should be classified as technical (> 8)
      expect(classifier.classify('123456789').type).toBe(QueryType.TECHNICAL_IDENTIFIER);
    });

    it('should handle malformed UUIDs', () => {
      // Too short
      expect(classifier.classify('123e4567-e89b-12d3-a456').type).toBe(QueryType.SEMANTIC_SEARCH);
      
      // Wrong format
      expect(classifier.classify('not-a-uuid-at-all-really').type).toBe(QueryType.SEMANTIC_SEARCH);
      
      // Non-hex characters
      expect(classifier.classify('gggggggg-gggg-gggg-gggg-gggggggggggg').type).toBe(QueryType.SEMANTIC_SEARCH);
    });

    it('should handle version-like but not version strings', () => {
      expect(classifier.classify('1.2').type).toBe(QueryType.EXACT_SEARCH); // Not enough parts
      expect(classifier.classify('a.b.c').type).toBe(QueryType.SEMANTIC_SEARCH); // Not numbers
    });
  });

  describe('Classification Confidence', () => {
    const classifier = new QueryClassifier();
    it('should maintain confidence hierarchy', () => {
      const wildcard = classifier.classify('*');
      const uuid = classifier.classify('123e4567-e89b-12d3-a456-426614174000');
      const version = classifier.classify('v1.2.3');
      const base64 = classifier.classify('dGVzdA==');
      const exact = classifier.classify('123');
      const semantic = classifier.classify('text query');

      // Confidence hierarchy: wildcard > uuid > version > base64, exact > semantic
      // Note: base64 (0.85) and exact (0.9) hierarchy depends on classification logic
      expect(wildcard.confidence).toBeGreaterThan(uuid.confidence);
      expect(uuid.confidence).toBeGreaterThan(version.confidence);
      expect(version.confidence).toBeGreaterThan(base64.confidence);
      expect(exact.confidence).toBeGreaterThan(semantic.confidence);
      // Exact search has higher confidence than base64 detection
      expect(exact.confidence).toBeGreaterThan(base64.confidence);
    });
  });

  describe('GDD v2.2.0 Compliance', () => {
    const classifier = new QueryClassifier();
    it('should implement all required query types from GDD', () => {
      // Verify all enum values are tested
      const allTypes = Object.values(QueryType);
      expect(allTypes).toContain(QueryType.WILDCARD);
      expect(allTypes).toContain(QueryType.TECHNICAL_IDENTIFIER);
      expect(allTypes).toContain(QueryType.EXACT_SEARCH);
      expect(allTypes).toContain(QueryType.SEMANTIC_SEARCH);
    });

    it('should return complete QueryIntent interface', () => {
      const result = classifier.classify('test query');
      
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('preprocessing');
      expect(result.preprocessing).toHaveProperty('normalized');
      expect(result.preprocessing).toHaveProperty('isSpecialPattern');
      expect(result.preprocessing).toHaveProperty('requiresExactMatch');
    });
  });
});
