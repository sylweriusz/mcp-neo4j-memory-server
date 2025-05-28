/**
 * Observation Domain Entity  
 * Single responsibility: Observation business logic and validation
 */

export class Observation {
  constructor(
    public readonly id: string,
    public readonly content: string,
    public readonly createdAt: Date = new Date(),
    public readonly source?: string,
    public readonly confidence?: number
  ) {
    this.validateObservation();
  }

  /**
   * Domain validation rules for Observation
   */
  private validateObservation(): void {
    if (!this.id || this.id.length !== 18) {
      throw new Error('Observation ID must be exactly 18 characters');
    }
    
    if (!this.content || this.content.trim().length === 0) {
      throw new Error('Observation content is required');
    }

    if (this.confidence !== undefined && (this.confidence < 0 || this.confidence > 1)) {
      throw new Error('Observation confidence must be between 0 and 1');
    }
  }

  /**
   * Check if observation is highly confident
   */
  isHighConfidence(): boolean {
    return this.confidence !== undefined && this.confidence >= 0.8;
  }

  /**
   * Get content length for analysis
   */
  getContentLength(): number {
    return this.content.length;
  }
}
