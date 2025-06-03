/**
 * Memory Repository Module - Clean Architecture Exports
 * THE IMPLEMENTOR'S RULE: Single import point for specialized repositories
 */

export { CoreMemoryRepository, CoreMemoryData } from './core-memory-repository';
export { GraphContextRepository, GraphContext, RelatedMemoryData } from './graph-context-repository';
export { ObservationRepository, ObservationData } from './observation-repository';
export { RelationRepository, EnhancedRelationRequest } from './relation-repository';
export { CompositeMemoryRepository } from './composite-memory-repository';
