import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the actual module being tested
import { addDatabaseTools, detectIdFormat } from '../src/database_tools';

describe('Database Tools', () => {
  let server: any;
  let knowledgeGraphManager: any;

  beforeEach(() => {
    // Reset the mock function call history
    vi.clearAllMocks();
    
    // Create the server and manager instances using the mocks
    server = { tool: vi.fn() };
    knowledgeGraphManager = {};
  });

  describe('Tool Registration', () => {
    it('addDatabaseTools function exists and runs without error', () => {
      // The actual function no longer registers tools - that's moved to index.ts
      // This test just verifies the function exists and runs without error
      expect(() => {
        addDatabaseTools(server, knowledgeGraphManager);
      }).not.toThrow();
      
      // Should not register any tools as they're now handled in index.ts
      expect(server.tool).not.toHaveBeenCalled();
    });
  });

  describe('ID Format Detection', () => {
    it('should detect UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(detectIdFormat(uuid)).toBe('uuid');
    });

    it('should detect compact format', () => {
      // Get an actual compact ID from the generator
      const compactId = '01234567890123456'; // 17 characters from valid set
      expect(detectIdFormat(compactId)).toBe('compact');
    });

    it('should detect unknown format for invalid strings', () => {
      expect(detectIdFormat('invalid-id')).toBe('unknown');
      expect(detectIdFormat('12345')).toBe('unknown');
      expect(detectIdFormat('not-a-valid-id')).toBe('unknown');
    });

    it('should handle empty and null inputs', () => {
      expect(detectIdFormat('')).toBe('unknown');
      expect(detectIdFormat(null as any)).toBe('unknown');
      expect(detectIdFormat(undefined as any)).toBe('unknown');
    });

    it('should handle edge cases', () => {
      // Too short for UUID
      expect(detectIdFormat('550e8400-e29b')).toBe('unknown');
      // Mixed case UUID
      expect(detectIdFormat('550E8400-E29B-41D4-A716-446655440000')).toBe('uuid');
      // Too long for compact ID (20 chars)
      expect(detectIdFormat('01234567890123456789')).toBe('unknown');
      // Right length but invalid character (space is not in BASE91)
      expect(detectIdFormat('0123456789012345 ')).toBe('unknown');
    });
  });
});
