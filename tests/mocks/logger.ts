// Simple logger mock for testing
import { vi } from 'vitest';

export const Logger = vi.fn().mockImplementation(() => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn()
}));

export const NullLogger = vi.fn().mockImplementation(() => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn()
}));