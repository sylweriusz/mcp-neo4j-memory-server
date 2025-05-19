/**
 * Vector support interface for Neo4j
 */

export { detectSupport as checkVectorSupport, resetCache as resetVectorSupportCache } from './detection';
export { createIndexes as ensureVectorIndexes } from './indexes';
export type { VectorSupport } from './detection';
