/**
 * Date Filter Processor Tests  
 * Single responsibility: Test date filtering for search operations
 * GDD v3.0: Tests for enhanced date-based filtering system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DateFilterProcessor, type DateFilterOptions } from '../../../../src/application/unified-handlers/services/date-filter-processor';

describe('DateFilterProcessor - Production Coverage', () => {
  let processor: DateFilterProcessor;

  beforeEach(() => {
    processor = new DateFilterProcessor();
  });

  describe('Date Filter Processing', () => {
    it('should process ISO date filters', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '2024-01-01T00:00:00Z',
        createdBefore: '2024-12-31T23:59:59Z',
        modifiedSince: '2024-06-01T12:00:00Z'
      };

      // Act
      const result = processor.processDateFilters(filters);

      // Assert
      expect(result.cypher).toBe('m.createdAt >= $createdAfter AND m.createdAt <= $createdBefore AND m.modifiedAt >= $modifiedSince');
      expect(result.params).toEqual({
        createdAfter: '2024-01-01T00:00:00.000Z',
        createdBefore: '2024-12-31T23:59:59.000Z',
        modifiedSince: '2024-06-01T12:00:00.000Z'
      });
    });

    it('should process relative date filters', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '7d', // 7 days ago
        modifiedSince: '30d', // 30 days ago
        accessedSince: '3m' // 3 months ago
      };

      // Act
      const result = processor.processDateFilters(filters);

      // Assert
      expect(result.cypher).toBe('m.createdAt >= $createdAfter AND m.modifiedAt >= $modifiedSince AND m.lastAccessed >= $accessedSince');
      expect(result.params).toHaveProperty('createdAfter');
      expect(result.params).toHaveProperty('modifiedSince');
      expect(result.params).toHaveProperty('accessedSince');
      
      // Verify dates are in the past
      const createdAfterDate = new Date(result.params.createdAfter);
      const now = new Date();
      expect(createdAfterDate).toBeDefined();
      expect(createdAfterDate.getTime()).toBeLessThan(now.getTime());
    });

    it('should handle mixed ISO and relative dates', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '2024-01-01', // ISO date
        modifiedSince: '7d' // Relative date
      };

      // Act
      const result = processor.processDateFilters(filters);

      // Assert
      expect(result.cypher).toBe('m.createdAt >= $createdAfter AND m.modifiedAt >= $modifiedSince');
      expect(result.params.createdAfter).toBe('2024-01-01T00:00:00.000Z');
      expect(result.params.modifiedSince).toBeDefined();
    });

    it('should return empty result for no filters', () => {
      // Act
      const result = processor.processDateFilters({});

      // Assert
      expect(result.cypher).toBe('');
      expect(result.params).toEqual({});
    });
  });

  describe('Relative Date Parsing', () => {
    it('should parse hours correctly', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '1h',
        modifiedSince: '24h'
      };

      // Act
      const result = processor.processDateFilters(filters);

      // Assert
      const createdAfter = new Date(result.params.createdAfter);
      const modifiedSince = new Date(result.params.modifiedSince);
      const now = new Date();
      
      // Should be approximately 1 hour ago (within 1 minute tolerance)
      expect(Math.abs(now.getTime() - createdAfter.getTime() - (1 * 60 * 60 * 1000))).toBeLessThan(60000);
      
      // Should be approximately 24 hours ago
      expect(Math.abs(now.getTime() - modifiedSince.getTime() - (24 * 60 * 60 * 1000))).toBeLessThan(60000);
    });

    it('should parse days correctly', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '7d'
      };

      // Act
      const result = processor.processDateFilters(filters);

      // Assert
      const createdAfter = new Date(result.params.createdAfter);
      const now = new Date();
      
      // Should be approximately 7 days ago (within 1 minute tolerance)
      const expectedTime = now.getTime() - (7 * 24 * 60 * 60 * 1000);
      expect(Math.abs(createdAfter.getTime() - expectedTime)).toBeLessThan(60000);
    });

    it('should parse months correctly', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '3m'
      };

      // Act
      const result = processor.processDateFilters(filters);

      // Assert
      const createdAfter = new Date(result.params.createdAfter);
      const now = new Date();
      
      // Should be approximately 3 months ago (within 1 day tolerance due to variable month lengths)
      const daysDifference = Math.abs(now.getTime() - createdAfter.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDifference).toBeGreaterThan(85); // ~3 months
      expect(daysDifference).toBeLessThan(95); // ~3 months
    });

    it('should parse years correctly', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '1y'
      };

      // Act
      const result = processor.processDateFilters(filters);

      // Assert
      const createdAfter = new Date(result.params.createdAfter);
      const now = new Date();
      
      // Should be approximately 1 year ago (within 1 day tolerance)
      const daysDifference = Math.abs(now.getTime() - createdAfter.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDifference).toBeGreaterThan(360);
      expect(daysDifference).toBeLessThan(370);
    });

    it('should handle case insensitive units', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '7D', // Uppercase
        modifiedSince: '3M', // Uppercase
        accessedSince: '1Y' // Uppercase
      };

      // Act & Assert - should not throw
      expect(() => processor.processDateFilters(filters)).not.toThrow();
    });
  });

  describe('Validation', () => {
    it('should validate conflicting date ranges', () => {
      // Arrange
      const conflictingFilters: DateFilterOptions = {
        createdAfter: '2024-12-31T23:59:59Z',
        createdBefore: '2024-01-01T00:00:00Z' // Before is earlier than after
      };

      // Act & Assert
      expect(() => processor.validateDateFilters(conflictingFilters))
        .toThrow('createdAfter must be earlier than createdBefore');
    });

    it('should validate individual date formats', () => {
      // Arrange
      const invalidFilters: DateFilterOptions = {
        createdAfter: 'invalid-date-format'
      };

      // Act & Assert
      expect(() => processor.validateDateFilters(invalidFilters))
        .toThrow('Invalid createdAfter');
    });

    it('should reject invalid relative date units', () => {
      // Arrange
      const invalidFilters: DateFilterOptions = {
        createdAfter: '7x' // Invalid unit
      };

      // Act & Assert
      expect(() => processor.validateDateFilters(invalidFilters))
        .toThrow('Invalid date format: 7x');
    });

    it('should validate all filter types', () => {
      // Arrange
      const validFilters: DateFilterOptions = {
        createdAfter: '2024-01-01',
        createdBefore: '2024-12-31',
        modifiedSince: '7d',
        accessedSince: '30d'
      };

      // Act & Assert - should not throw
      expect(() => processor.validateDateFilters(validFilters)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid ISO date strings', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: '2024-13-45T25:99:99Z' // Invalid date
      };

      // Act & Assert
      expect(() => processor.processDateFilters(filters))
        .toThrow('Invalid date format');
    });

    it('should handle invalid relative format', () => {
      // Arrange
      const filters: DateFilterOptions = {
        createdAfter: 'not-a-date'
      };

      // Act & Assert
      expect(() => processor.processDateFilters(filters))
        .toThrow('Invalid date format: not-a-date');
    });

    it('should provide helpful error messages', () => {
      // Arrange - Test with invalid date format that actually triggers an error
      const filters: DateFilterOptions = {
        createdAfter: 'invalid-date-string'
      };

      // Act & Assert
      expect(() => processor.processDateFilters(filters))
        .toThrow('Invalid date format');
    });
  });

  describe('Supported Formats Documentation', () => {
    it('should provide comprehensive format documentation', () => {
      // Act
      const formats = processor.getSupportedFormats();

      // Assert
      expect(formats).toEqual([
        'ISO dates: "2025-01-01", "2025-01-01T10:00:00Z"',
        'Relative: "1h" (1 hour ago), "24h" (24 hours ago)',
        'Relative: "7d" (7 days ago), "30d" (30 days ago)',
        'Relative: "3m" (3 months ago), "1y" (1 year ago)'
      ]);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle multiple filters efficiently', () => {
      // Arrange
      const allFilters: DateFilterOptions = {
        createdAfter: '7d',
        createdBefore: '2024-12-31',
        modifiedSince: '30d',
        accessedSince: '3m'
      };

      // Act
      const startTime = Date.now();
      const result = processor.processDateFilters(allFilters);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
      expect(result.cypher.split(' AND ')).toHaveLength(4);
      expect(Object.keys(result.params)).toHaveLength(4);
    });

    it('should handle null and undefined values gracefully', () => {
      // Arrange
      const filtersWithNulls: DateFilterOptions = {
        createdAfter: undefined,
        createdBefore: null as any,
        modifiedSince: '7d'
      };

      // Act
      const result = processor.processDateFilters(filtersWithNulls);

      // Assert
      expect(result.cypher).toBe('m.modifiedAt >= $modifiedSince');
      expect(Object.keys(result.params)).toEqual(['modifiedSince']);
    });
  });
});
