/**
 * Local ID Resolver Service
 * Single responsibility: Map localId → realId after memory creation
 * THE IMPLEMENTOR'S RULE: Build exactly what's specified - local ID resolution for batch operations
 */

export interface LocalIdMapping {
  localId: string;
  realId: string;
}

export interface ResolvedRequest<T> {
  resolved: T;
  mapping: Map<string, string>; // localId → realId
}

export class LocalIdResolver {
  
  /**
   * Resolve local IDs in memory creation request
   * Maps localId references to actual generated memory IDs
   */
  resolveMemoryRequest<T extends { from?: string; to?: string }>(
    relations: T[],
    localIdMap: Map<string, string>
  ): ResolvedRequest<T[]> {
    const resolved = relations.map(relation => ({
      ...relation,
      from: this.resolveId(relation.from, localIdMap),
      to: this.resolveId(relation.to, localIdMap)
    }));

    return {
      resolved,
      mapping: localIdMap
    };
  }

  /**
   * Build localId → realId mapping from created memories
   */
  buildMapping(memories: Array<{ localId?: string; id: string }>): Map<string, string> {
    const mapping = new Map<string, string>();
    
    for (const memory of memories) {
      if (memory.localId) {
        mapping.set(memory.localId, memory.id);
      }
    }
    
    return mapping;
  }

  /**
   * Validate local IDs before processing
   * Ensures uniqueness within request and no conflicts with existing IDs
   */
  validateLocalIds(memories: Array<{ localId?: string; name: string }>): void {
    const localIds = new Set<string>();
    
    for (const memory of memories) {
      if (memory.localId) {
        // Check for duplicates within request
        if (localIds.has(memory.localId)) {
          throw new Error(
            `Duplicate localId "${memory.localId}" in request. ` +
            `LocalIds must be unique within a single operation.`
          );
        }
        
        // Check if localId looks like a real memory ID (18-char BASE85)
        if (this.looksLikeRealId(memory.localId)) {
          throw new Error(`Local ID cannot look like real memory ID: ${memory.localId}`);
        }
        
        localIds.add(memory.localId);
      }
    }
  }

  /**
   * Resolve a single ID - could be localId or existing memoryId
   */
  private resolveId(id: string | undefined, localIdMap: Map<string, string>): string {
    if (!id) {
      throw new Error('ID cannot be undefined in relation');
    }
    
    // Try to resolve as localId first
    const realId = localIdMap.get(id);
    if (realId) {
      return realId;
    }
    
    // Check if this looks like a localId but wasn't found
    if (!this.looksLikeRealId(id)) {
      const availableLocalIds = Array.from(localIdMap.keys()).join(', ');
      throw new Error(
        `LocalId "${id}" not found. LocalIds only work within the same operation. ` +
        `Available localIds in this operation: [${availableLocalIds}]. ` +
        `For cross-operation references, use real memory IDs from previous responses.`
      );
    }
    
    // Assume it's an existing memory ID
    return id;
  }

  /**
   * Check if string looks like a real memory ID (18-char BASE85)
   */
  private looksLikeRealId(str: string): boolean {
    // Real memory IDs are exactly 18 characters and use BASE85 charset
    if (str.length !== 18) {
      return false;
    }
    
    // BASE85 charset from id_generator.ts
    const base85Pattern = /^[0-9A-Za-z!#$%&()*+,\-./:;=?@_{}~`]+$/;
    return base85Pattern.test(str);
  }

  /**
   * Convert mapping to response format
   */
  mappingToResponse(mapping: Map<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [localId, realId] of mapping.entries()) {
      result[localId] = realId;
    }
    return result;
  }
}
