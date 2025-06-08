/**
 * Date Filter Processor
 * Single responsibility: Handle relative and absolute date filtering
 * THE IMPLEMENTOR'S RULE: Support both ISO dates and relative formats without fallbacks
 */

export interface DateFilterOptions {
  createdAfter?: string;
  createdBefore?: string;
  modifiedSince?: string;
  accessedSince?: string;
}

export interface ProcessedDateFilter {
  cypher: string;
  params: Record<string, string>;
}

export class DateFilterProcessor {
  
  /**
   * Process date filters into Cypher WHERE clauses
   * Zero-fallback: Invalid dates throw errors immediately
   */
  processDateFilters(filters: DateFilterOptions): ProcessedDateFilter {
    const whereClauses: string[] = [];
    const params: Record<string, string> = {};
    
    if (filters.createdAfter) {
      const dateValue = this.parseDate(filters.createdAfter);
      whereClauses.push('m.createdAt >= $createdAfter');
      params.createdAfter = dateValue;
    }
    
    if (filters.createdBefore) {
      const dateValue = this.parseDate(filters.createdBefore);
      whereClauses.push('m.createdAt <= $createdBefore');
      params.createdBefore = dateValue;
    }
    
    if (filters.modifiedSince) {
      const dateValue = this.parseDate(filters.modifiedSince);
      whereClauses.push('m.modifiedAt >= $modifiedSince');
      params.modifiedSince = dateValue;
    }
    
    if (filters.accessedSince) {
      const dateValue = this.parseDate(filters.accessedSince);
      whereClauses.push('m.lastAccessed >= $accessedSince');
      params.accessedSince = dateValue;
    }
    
    return {
      cypher: whereClauses.length > 0 ? whereClauses.join(' AND ') : '',
      params
    };
  }

  /**
   * Parse date string - supports both ISO dates and relative formats
   * Relative formats: "1h", "24h", "7d", "30d", "3m", "1y"
   */
  private parseDate(dateInput: string): string {
    // Try relative format first - now includes hours
    const relativeMatch = dateInput.match(/^(\d+)([hmdyHMDY])$/);
    if (relativeMatch) {
      return this.parseRelativeDate(parseInt(relativeMatch[1]), relativeMatch[2].toLowerCase());
    }
    
    // Try ISO date format
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${dateInput}`);
      }
      return date.toISOString();
    } catch (error) {
      throw new Error(`Invalid date format: ${dateInput}. Use ISO format (2025-01-01) or relative format (1h, 24h, 7d, 30d, 3m, 1y)`);
    }
  }

  /**
   * Convert relative date to ISO string
   * "1h" = 1 hour ago, "7d" = 7 days ago, "3m" = 3 months ago, "1y" = 1 year ago
   */
  private parseRelativeDate(amount: number, unit: string): string {
    const now = new Date();
    
    switch (unit) {
      case 'h':
        now.setHours(now.getHours() - amount);
        break;
      case 'd':
        now.setDate(now.getDate() - amount);
        break;
      case 'm':
        now.setMonth(now.getMonth() - amount);
        break;
      case 'y':
        now.setFullYear(now.getFullYear() - amount);
        break;
      default:
        throw new Error(`Invalid relative date unit: ${unit}. Use 'h' (hours), 'd' (days), 'm' (months), or 'y' (years)`);
    }
    
    return now.toISOString();
  }

  /**
   * Validate date filter parameters
   */
  validateDateFilters(filters: DateFilterOptions): void {
    // Check for conflicting date ranges
    if (filters.createdAfter && filters.createdBefore) {
      const afterDate = new Date(this.parseDate(filters.createdAfter));
      const beforeDate = new Date(this.parseDate(filters.createdBefore));
      
      if (afterDate >= beforeDate) {
        throw new Error('createdAfter must be earlier than createdBefore');
      }
    }
    
    // Validate each filter individually
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        try {
          this.parseDate(value);
        } catch (error) {
          throw new Error(`Invalid ${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
  }

  /**
   * Get supported date formats for user guidance
   */
  getSupportedFormats(): string[] {
    return [
      'ISO dates: "2025-01-01", "2025-01-01T10:00:00Z"',
      'Relative: "1h" (1 hour ago), "24h" (24 hours ago)',
      'Relative: "7d" (7 days ago), "30d" (30 days ago)',
      'Relative: "3m" (3 months ago), "1y" (1 year ago)'
    ];
  }
}
