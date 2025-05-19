import { describe, it, expect } from 'vitest';
import { extractError } from '../src/utils';

describe('Utils', () => {
  describe('extractError', () => {
    it('should extract message from Error instance', () => {
      const errorMessage = 'Test error message';
      const error = new Error(errorMessage);
      const result = extractError(error);
      
      expect(result).toEqual({ message: errorMessage });
    });
    
    it('should handle non-Error instances', () => {
      const nonErrors = [
        'string error',
        123,
        { custom: 'error' },
        null,
        undefined
      ];
      
      for (const value of nonErrors) {
        const result = extractError(value);
        expect(result).toEqual({ message: 'Unknown error' });
      }
    });
  });
});
