// Vector integration mock for testing
import { vi } from 'vitest';

export const addVectorTools = vi.fn();
export const afterMemoryCreate = vi.fn();
export const afterMemoryUpdate = vi.fn();
export const afterObservationChange = vi.fn();
export const afterDatabaseSelect = vi.fn();
export const enhancedSearch = vi.fn();