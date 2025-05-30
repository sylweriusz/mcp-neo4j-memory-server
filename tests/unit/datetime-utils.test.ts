/**
 * DateTime Utilities Tests
 * Single responsibility: Verify datetime utility functions
 */
import { describe, it, expect } from 'vitest';
import { convertDateTimeToString, detectIdFormat } from '../../src/infrastructure/utilities/datetime-utils';

describe('DateTime Utilities', () => {
  describe('convertDateTimeToString', () => {
    it('should convert Date object to string', () => {
      const date = new Date('2025-05-30T00:00:00.000Z');
      const result = convertDateTimeToString(date);
      expect(result).toBe(date.toString());
    });

    it('should return the same string if input is already a string', () => {
      const dateString = '2025-05-30T00:00:00.000Z';
      const result = convertDateTimeToString(dateString);
      expect(result).toBe(dateString);
    });

    it('should return empty string for null input', () => {
      const result = convertDateTimeToString(null);
      expect(result).toBe('');
    });

    it('should return empty string for undefined input', () => {
      const result = convertDateTimeToString(undefined);
      expect(result).toBe('');
    });

    it('should use toString method if available', () => {
      const obj = {
        toString: () => 'Custom toString result'
      };
      const result = convertDateTimeToString(obj);
      expect(result).toBe('Custom toString result');
    });

    it('should convert numbers to string', () => {
      const num = 12345;
      const result = convertDateTimeToString(num);
      expect(result).toBe('12345');
    });

    it('should handle Neo4j DateTime objects', () => {
      // Mock a Neo4j DateTime object
      const neo4jDateTime = {
        year: 2025,
        month: 5,
        day: 30,
        hour: 0,
        minute: 0,
        second: 0,
        nanosecond: 0,
        timeZoneOffsetSeconds: 0,
        toString: function() {
          return '2025-05-30T00:00:00.000Z';
        }
      };
      
      const result = convertDateTimeToString(neo4jDateTime);
      expect(result).toBe('2025-05-30T00:00:00.000Z');
    });
  });

  describe('detectIdFormat', () => {
    it('should detect UUID format', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = detectIdFormat(uuid);
      expect(result).toBe('uuid');
    });

    it('should detect compact ID format', () => {
      const compactId = 'Bm>test12345678901'; // Exactly 18 characters
      console.log('Compact ID length:', compactId.length);
      console.log('Regex test:', /^[!-~]+$/.test(compactId));
      const result = detectIdFormat(compactId);
      expect(result).toBe('compact');
    });

    it('should return unknown for invalid formats', () => {
      const invalidId = 'not-a-valid-id';
      const result = detectIdFormat(invalidId);
      expect(result).toBe('unknown');
    });

    it('should return unknown for empty string', () => {
      const result = detectIdFormat('');
      expect(result).toBe('unknown');
    });

    it('should handle uppercase UUIDs', () => {
      const uppercaseUuid = '123E4567-E89B-12D3-A456-426614174000';
      const result = detectIdFormat(uppercaseUuid);
      expect(result).toBe('uuid');
    });

    it('should correctly identify compact IDs with special characters', () => {
      const specialCharId = 'Bm>!#$%&()*+,-./:;';
      const result = detectIdFormat(specialCharId);
      expect(result).toBe('compact');
    });

    it('should return unknown for IDs that are too short', () => {
      const shortId = 'short';
      const result = detectIdFormat(shortId);
      expect(result).toBe('unknown');
    });

    it('should return unknown for IDs that are too long', () => {
      const longId = 'thisisaverylongidthatisnotavaliduuidorcompactid';
      const result = detectIdFormat(longId);
      expect(result).toBe('unknown');
    });
  });
});
