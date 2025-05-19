/**
 * Vector support interface for Neo4j
 * Re-exports essential functions only
 */

export { 
  detectSupport as checkVectorSupport, 
  resetCache as resetVectorSupportCache 
} from './support/detection';

export { 
  createIndexes as ensureVectorIndexes 
} from './support/indexes';

export type { VectorSupport } from './support/detection';
