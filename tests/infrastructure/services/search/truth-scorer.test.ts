/**
 * TruthScorer Tests - Truth-First Search Architecture
 * Single responsibility: Test truth hierarchy scoring according to GDD v2.2.0
 * 
 * Test Coverage Target: 85%+ (Core scoring component)
 */

import { describe, it, expect } from 'vitest';
import { TruthScorer, TruthLevel, SearchCandidate, MatchEvidence } from '../../../../src/infrastructure/services/search/truth-scorer';

describe('TruthScorer - Truth Hierarchy System', () => {
  const scorer = new TruthScorer();

  describe('Truth Level Hierarchy Enforcement', () => {
    it('should prioritize perfect truth over all other scores', () => {
      const candidate: SearchCandidate = {
        id: 'test-1',
        name: 'Test Memory',
        metadata: { description: 'test data' },
        evidence: {
          hasExactMetadata: true,
          hasExactName: false,
          hasExactContent: false,
          hasPerfectMatch: true,  // Perfect truth condition
          contentMatchBonus: 0,
          namePartialBonus: 0
        }
      };

      const score = scorer.calculateTruthScore(candidate, 'test', 0.95); // High vector score
      
      expect(score).toBe(TruthLevel.PERFECT_TRUTH); // Should be 1.0, not vector score
    });

    it('should cap semantic scores at SEMANTIC_CAP', () => {
      const candidate: SearchCandidate = {
        id: 'test-2',
        name: 'Test Memory',
        metadata: {},
        evidence: {
          hasExactMetadata: false,
          hasExactName: false,
          hasExactContent: false,
          hasPerfectMatch: false,
          contentMatchBonus: 0.25, // Max bonus
          namePartialBonus: 0.20   // Max bonus
        }
      };

      const score = scorer.calculateTruthScore(candidate, 'test', 0.99); // Very high vector score
      
      expect(score).toBeLessThanOrEqual(TruthLevel.SEMANTIC_CAP); // Should be capped at 0.75
    });

    it('should respect truth level hierarchy order', () => {
      // Create candidates for each truth level
      const perfectCandidate = createCandidate({ hasPerfectMatch: true });
      const metadataCandidate = createCandidate({ hasExactMetadata: true });
      const nameCandidate = createCandidate({ hasExactName: true });
      const contentCandidate = createCandidate({ hasExactContent: true });
      const semanticCandidate = createCandidate({}); // Semantic only

      const perfectScore = scorer.calculateTruthScore(perfectCandidate, 'test', 0.8);
      const metadataScore = scorer.calculateTruthScore(metadataCandidate, 'test', 0.8);
      const nameScore = scorer.calculateTruthScore(nameCandidate, 'test', 0.8);
      const contentScore = scorer.calculateTruthScore(contentCandidate, 'test', 0.8);
      const semanticScore = scorer.calculateTruthScore(semanticCandidate, 'test', 0.8);

      expect(perfectScore).toBeGreaterThan(metadataScore);
      expect(metadataScore).toBeGreaterThan(nameScore);
      expect(nameScore).toBeGreaterThan(contentScore);
      expect(contentScore).toBeGreaterThan(semanticScore);
    });
  });

  describe('Perfect Truth Detection', () => {
    it('should detect perfect truth for exact metadata + long query', () => {
      const evidence = scorer.analyzeMatchEvidence(
        { name: 'test', metadata: { description: 'very long query match here' }},
        'very long query match here',
        'very long query match here' // Original query > 10 chars
      );
      
      expect(evidence.hasPerfectMatch).toBe(true);
    });

    it('should detect perfect truth for exact name match', () => {
      const evidence = scorer.analyzeMatchEvidence(
        { name: 'exact match', metadata: {} },
        'exact match',
        'exact match'
      );
      
      expect(evidence.hasPerfectMatch).toBe(true);
    });

    it('should NOT detect perfect truth for short exact metadata', () => {
      const evidence = scorer.analyzeMatchEvidence(
        { name: 'test', metadata: { data: 'short' }},
        'short',
        'short' // Only 5 chars, < 10 required
      );
      
      expect(evidence.hasPerfectMatch).toBe(false);
      expect(evidence.hasExactMetadata).toBe(true); // But still exact
    });
  });

  describe('Match Evidence Analysis', () => {
    it('should detect exact metadata matches (case-insensitive)', () => {
      const evidence = scorer.analyzeMatchEvidence(
        { name: 'test', metadata: { description: 'Machine Learning Project' }},
        'machine learning',
        'Machine Learning'
      );
      
      expect(evidence.hasExactMetadata).toBe(true);
    });

    it('should detect exact name matches (case-insensitive)', () => {
      const evidence = scorer.analyzeMatchEvidence(
        { name: 'Project Alpha', metadata: {} },
        'project alpha',
        'Project Alpha'
      );
      
      expect(evidence.hasExactName).toBe(true);
    });

    it('should calculate name match bonuses correctly', () => {
      // Exact name match
      const exactEvidence = scorer.analyzeMatchEvidence(
        { name: 'exact match', metadata: {} },
        'exact match',
        'exact match'
      );
      expect(exactEvidence.namePartialBonus).toBe(0.2);

      // Partial contains match
      const partialEvidence = scorer.analyzeMatchEvidence(
        { name: 'project status update', metadata: {} },
        'status',
        'status'
      );
      expect(partialEvidence.namePartialBonus).toBe(0.1);

      // Word boundary match
      const wordEvidence = scorer.analyzeMatchEvidence(
        { name: 'machine learning project', metadata: {} },
        'machine project',
        'machine project'
      );
      expect(wordEvidence.namePartialBonus).toBeGreaterThan(0);
      expect(wordEvidence.namePartialBonus).toBeLessThan(0.1);
    });
  });

  // Helper functions
  function createCandidate(evidenceOverrides: Partial<MatchEvidence>): SearchCandidate {
    return {
      id: 'test-candidate',
      name: 'Test Memory',
      metadata: {},
      evidence: createEvidence(evidenceOverrides)
    };
  }

  function createEvidence(overrides: Partial<MatchEvidence>): MatchEvidence {
    return {
      hasExactMetadata: false,
      hasExactName: false,
      hasExactContent: false,
      hasPerfectMatch: false,
      contentMatchBonus: 0,
      namePartialBonus: 0,
      ...overrides
    };
  }
});
