/**
 * Memory Domain Entity
 * Single responsibility: Memory business logic and validation
 */

export class Memory {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly memoryType: string,
    public readonly metadata: Record<string, any> = {},
    public readonly createdAt: Date = new Date(),
    public modifiedAt: Date = new Date(),
    public lastAccessed: Date = new Date()
  ) {
    this.validateMemory();
  }

  /**
   * Domain validation rules for Memory
   */
  private validateMemory(): void {
    if (!this.id || this.id.length !== 18) {
      throw new Error('Memory ID must be exactly 18 characters');
    }
    
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Memory name is required');
    }
    
    if (!this.memoryType || this.memoryType.trim().length === 0) {
      throw new Error('Memory type is required');
    }
  }

  /**
   * Update last accessed timestamp
   */
  markAsAccessed(): Memory {
    return new Memory(
      this.id,
      this.name,
      this.memoryType,
      this.metadata,
      this.createdAt,
      this.modifiedAt,
      new Date()
    );
  }

  /**
   * Create updated memory with new modification time
   */
  withUpdatedMetadata(newMetadata: Record<string, any>): Memory {
    return new Memory(
      this.id,
      this.name,
      this.memoryType,
      { ...this.metadata, ...newMetadata },
      this.createdAt,
      new Date(),
      this.lastAccessed
    );
  }
}
