/**
 * Neo4j DateTime Utilities
 * Single responsibility: Handle Neo4j DateTime conversions
 */

export const convertDateTimeToString = (datetime: any): string => {
  if (!datetime) return '';
  if (typeof datetime === 'string') return datetime;
  if (datetime.toString) return datetime.toString();
  return String(datetime);
};

export const detectIdFormat = (id: string): 'uuid' | 'compact' | 'unknown' => {
  if (!id) return 'unknown';
  
  // Test for UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return 'uuid';
  
  // Test for compact ID format - simplified check
  if (id.length === 18 && /^[!-~]+$/.test(id)) return 'compact';
  
  return 'unknown';
};
