/**
 * Unified Handlers Index
 * Single export point for all unified tool handlers
 */

// Support Services
export * from './services';

// Unified Handlers
export { UnifiedMemoryStoreHandler } from './unified-memory-store-handler';
export { UnifiedMemoryFindHandler } from './unified-memory-find-handler';
export { UnifiedMemoryModifyHandler } from './unified-memory-modify-handler';

// Types
export type { 
  MemoryDefinition,
  RelationDefinition,
  MemoryStoreRequest,
  MemoryStoreResponse,
  ConnectionResult
} from './unified-memory-store-handler';

export type { 
  MemoryFindRequest,
  MemoryFindResponse
} from './unified-memory-find-handler';

export type { 
  ModifyOperation,
  ModifyChanges,
  ObservationChange,
  RelationChange,
  MemoryModifyRequest,
  MemoryModifyResponse
} from './unified-memory-modify-handler';
