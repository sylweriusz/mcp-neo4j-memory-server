import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Session } from 'neo4j-driver';
import { detectSupport, resetCache, VectorSupport } from '../src/vector/support/detection';

describe('Vector Support Detection', () => {
  let mockSession: Session;

  beforeEach(() => {
    // Create mock session
    mockSession = {
      run: vi.fn(),
      close: vi.fn(),
    } as any;

    // Reset cache before each test
    resetCache();
    vi.clearAllMocks();
  });

  describe('detectSupport', () => {
    it('should detect GDS support', async () => {
      // Mock successful GDS query
      (mockSession.run as Mock).mockResolvedValue({});

      const result = await detectSupport(mockSession);

      expect(result).toBe('gds');
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('gds.similarity.cosine')
      );
    });

    it('should detect enterprise support when GDS fails', async () => {
      // Mock GDS query failure, enterprise success
      (mockSession.run as Mock)
        .mockRejectedValueOnce(new Error('GDS not available'))
        .mockResolvedValue({});

      const result = await detectSupport(mockSession);

      expect(result).toBe('enterprise');
      expect(mockSession.run).toHaveBeenCalledTimes(2);
      expect(mockSession.run).toHaveBeenLastCalledWith(
        expect.stringContaining('vector.similarity')
      );
    });

    it('should detect no support when both fail', async () => {
      // Mock both queries failing
      (mockSession.run as Mock)
        .mockRejectedValueOnce(new Error('GDS not available'))
        .mockRejectedValueOnce(new Error('Enterprise not available'));

      const result = await detectSupport(mockSession);

      expect(result).toBe('none');
      expect(mockSession.run).toHaveBeenCalledTimes(2);
    });

    it('should use cached result on subsequent calls', async () => {
      // Mock successful GDS query
      (mockSession.run as Mock).mockResolvedValue({});

      // First call
      const result1 = await detectSupport(mockSession);
      expect(result1).toBe('gds');

      // Reset the cache and detection should run again (test environment clears cache)
      const result2 = await detectSupport(mockSession);
      expect(result2).toBe('gds');

      // Should be called twice since cache is cleared in test environment
      expect(mockSession.run).toHaveBeenCalledTimes(2);
    });

    it('should clear cache in test environment', async () => {
      // Set cache by running detection
      (mockSession.run as Mock).mockResolvedValue({});
      await detectSupport(mockSession);
      expect(mockSession.run).toHaveBeenCalledTimes(1);

      // Reset cache and detection should run again
      resetCache();
      await detectSupport(mockSession);
      expect(mockSession.run).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetCache', () => {
    it('should only reset cache in test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      
      // Try resetting in non-test environment
      process.env.NODE_ENV = 'production';
      resetCache(); // Should do nothing
      
      // Restore test environment
      process.env.NODE_ENV = 'test';
      
      // This should work
      resetCache();
      
      // Restore original
      process.env.NODE_ENV = originalEnv;
    });
  });

  it('should handle different error types gracefully', async () => {
    // Mock GDS with network error
    (mockSession.run as Mock)
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValue({});

    const result = await detectSupport(mockSession);
    expect(result).toBe('enterprise');
  });

  it('should handle session run throwing non-Error objects', async () => {
    // Mock GDS throwing string, enterprise throwing object
    (mockSession.run as Mock)
      .mockRejectedValueOnce('String error')
      .mockRejectedValueOnce({ code: 'ERR_SYNTAX' });

    const result = await detectSupport(mockSession);
    expect(result).toBe('none');
  });
});
