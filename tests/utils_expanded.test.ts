import { describe, it, expect, vi } from 'vitest';
import { extractError, convertDateTimeToString, stripEmbeddings } from '../src/utils';

describe('Utils', () => {
  describe('extractError', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      const result = extractError(error);
      expect(result).toEqual({ message: 'Test error message' });
    });

    it('should handle non-Error instances', () => {
      const result1 = extractError('string error');
      expect(result1).toEqual({ message: 'Unknown error' });
      
      const result2 = extractError({ custom: 'error' });
      expect(result2).toEqual({ message: 'Unknown error' });
      
      const result3 = extractError(null);
      expect(result3).toEqual({ message: 'Unknown error' });
      
      const result4 = extractError(undefined);
      expect(result4).toEqual({ message: 'Unknown error' });
      
      const result5 = extractError(42);
      expect(result5).toEqual({ message: 'Unknown error' });
    });
  });

  describe('convertDateTimeToString', () => {
    it('should return undefined for null/undefined input', () => {
      expect(convertDateTimeToString(null)).toBeUndefined();
      expect(convertDateTimeToString(undefined)).toBeUndefined();
    });

    it('should return string as-is', () => {
      const isoString = '2023-01-01T00:00:00.000Z';
      expect(convertDateTimeToString(isoString)).toBe(isoString);
    });

    it('should convert Neo4j DateTime object', () => {
      const neo4jDateTime = {
        year: { low: 2023 },
        month: { low: 5 },
        day: { low: 15 },
        hour: { low: 14 },
        minute: { low: 30 },
        second: { low: 45 },
        nanosecond: { low: 123456789 }
      };
      
      const result = convertDateTimeToString(neo4jDateTime);
      expect(result).toBeDefined();
      expect(result).toMatch(/2023-05-15T\d{2}:30:45/); // Hour varies due to timezone conversion
    });

    it('should handle Neo4j DateTime without hour/minute/second', () => {
      const neo4jDateTime = {
        year: 2023,
        month: 12,
        day: 25
      };
      
      const result = convertDateTimeToString(neo4jDateTime);
      expect(result).toBeDefined();
      expect(result).toMatch(/2023-12-2[45]T\d{2}:00:00/); // Day might vary due to timezone conversion
    });

    it('should convert JavaScript Date object', () => {
      const jsDate = new Date('2023-01-01T00:00:00.000Z');
      const result = convertDateTimeToString(jsDate);
      expect(result).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should handle malformed DateTime objects', () => {
      const malformedDateTime = {
        year: 'invalid',
        month: 'invalid',
        day: 'invalid'
      };
      
      const result = convertDateTimeToString(malformedDateTime);
      expect(result).toBeUndefined();
    });

    it('should return undefined for unrecognized formats', () => {
      expect(convertDateTimeToString({})).toBeUndefined();
      expect(convertDateTimeToString([])).toBeUndefined();
      expect(convertDateTimeToString('not-a-date')).toBe('not-a-date'); // Strings pass through
      expect(convertDateTimeToString(42)).toBeUndefined();
    });
  });

  describe('stripEmbeddings', () => {
    it('should handle null/undefined input', () => {
      expect(stripEmbeddings(null)).toBeNull();
      expect(stripEmbeddings(undefined)).toBeUndefined();
    });

    it('should strip nameEmbedding from single memory object', () => {
      const memory = {
        id: 'test-id',
        name: 'Test Memory',
        memoryType: 'test',
        nameEmbedding: [0.1, 0.2, 0.3],
        observations: ['test observation']
      };
      
      const result = stripEmbeddings(memory);
      expect(result).toEqual({
        id: 'test-id',
        name: 'Test Memory',
        memoryType: 'test',
        observations: ['test observation']
      });
      expect(result.nameEmbedding).toBeUndefined();
    });

    it('should handle memory without nameEmbedding', () => {
      const memory = {
        id: 'test-id',
        name: 'Test Memory',
        memoryType: 'test',
        observations: ['test observation']
      };
      
      const result = stripEmbeddings(memory);
      expect(result).toEqual(memory);
    });

    it('should strip nameEmbedding from array of memories', () => {
      const memories = [
        {
          id: 'test-id-1',
          name: 'Test Memory 1',
          nameEmbedding: [0.1, 0.2, 0.3]
        },
        {
          id: 'test-id-2', 
          name: 'Test Memory 2',
          nameEmbedding: [0.4, 0.5, 0.6]
        }
      ];
      
      const result = stripEmbeddings(memories);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'test-id-1',
        name: 'Test Memory 1'
      });
      expect(result[1]).toEqual({
        id: 'test-id-2',
        name: 'Test Memory 2'
      });
      expect(result[0].nameEmbedding).toBeUndefined();
      expect(result[1].nameEmbedding).toBeUndefined();
    });

    it('should handle array with null/undefined elements', () => {
      const memories = [
        {
          id: 'test-id-1',
          name: 'Test Memory 1',
          nameEmbedding: [0.1, 0.2, 0.3]
        },
        null,
        undefined,
        {
          id: 'test-id-2',
          name: 'Test Memory 2'
        }
      ];
      
      const result = stripEmbeddings(memories);
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({
        id: 'test-id-1',
        name: 'Test Memory 1'
      });
      expect(result[1]).toBeNull();
      expect(result[2]).toBeUndefined();
      expect(result[3]).toEqual({
        id: 'test-id-2',
        name: 'Test Memory 2'
      });
    });

    it('should handle empty array', () => {
      const result = stripEmbeddings([]);
      expect(result).toEqual([]);
    });
  });
});
