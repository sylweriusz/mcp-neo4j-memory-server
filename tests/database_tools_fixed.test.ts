import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectIdFormat } from '../src/database_tools';

describe('Database Tools', () => {
  describe('detectIdFormat', () => {
    it('should detect UUID format', () => {
      const uuidId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      expect(detectIdFormat(uuidId)).toBe('uuid');
    });

    it('should detect compact format', () => {
      const compactId = 'abcDEF0123456789A'; // 17 chars from valid BASE91 set
      expect(detectIdFormat(compactId)).toBe('compact');
    });

    it('should detect unknown format for invalid strings', () => {
      expect(detectIdFormat('invalid-string-123')).toBe('unknown');
      expect(detectIdFormat('not-an-id')).toBe('unknown');
      expect(detectIdFormat('random')).toBe('unknown');
    });

    it('should handle empty and null inputs', () => {
      expect(detectIdFormat('')).toBe('unknown');
      expect(detectIdFormat(null as any)).toBe('unknown');
      expect(detectIdFormat(undefined as any)).toBe('unknown');
    });

    it('should handle edge cases', () => {
      // Almost-UUID but not quite
      expect(detectIdFormat('f47ac10b-58cc-4372-a567-0e02b2c3d47')).toBe('unknown');
      // Too short compact ID
      expect(detectIdFormat('6g0A8!7')).toBe('unknown');
      // Too long compact ID
      expect(detectIdFormat('6g0A8!7HX5%)~$qBextracharacters')).toBe('unknown');
    });
  });
});
