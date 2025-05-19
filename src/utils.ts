export const extractError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
    };
  } else {
    return {
      message: "Unknown error",
    };
  }
};

/**
 * Converts Neo4j DateTime object to ISO string
 * @param dateTime Neo4j DateTime object or string/null
 * @returns ISO string or original value if not a DateTime object
 */
export const convertDateTimeToString = (dateTime: any): string | undefined => {
  if (!dateTime) return undefined;
  
  // If it's already a string, return as is
  if (typeof dateTime === 'string') return dateTime;
  
  // If it's a Neo4j DateTime object with year, month, day properties
  if (dateTime && typeof dateTime === 'object' && dateTime.year) {
    try {
      // Extract components from Neo4j DateTime structure
      const year = dateTime.year?.low || dateTime.year;
      const month = dateTime.month?.low || dateTime.month;
      const day = dateTime.day?.low || dateTime.day;
      const hour = dateTime.hour?.low || dateTime.hour || 0;
      const minute = dateTime.minute?.low || dateTime.minute || 0;
      const second = dateTime.second?.low || dateTime.second || 0;
      const nanosecond = dateTime.nanosecond?.low || dateTime.nanosecond || 0;
      
      // Create JavaScript Date object and convert to ISO string
      const jsDate = new Date(year, month - 1, day, hour, minute, second, Math.floor(nanosecond / 1000000));
      return jsDate.toISOString();
    } catch (error) {
      // Failed to convert Neo4j DateTime - using undefined
      return undefined;
    }
  }
  
  // If it's a Date object, convert to ISO string
  if (dateTime instanceof Date) {
    return dateTime.toISOString();
  }
  
  // Return undefined for unrecognized formats
  return undefined;
};

/**
 * Removes embedding data from entities for cleaner API responses
 * @param entities Single memory object or array of memory objects
 * @returns Entities with nameEmbedding and other vector data removed
 */
export const stripEmbeddings = (entities: any) => {
  if (!entities) return entities;
  
  // Handle array of entities
  if (Array.isArray(entities)) {
    return entities.map(memory => {
      if (!memory) return memory;
      
      // Create shallow copy without nameEmbedding
      const { nameEmbedding, ...rest } = memory;
      return rest;
    });
  }
  
  // Handle single memory
  if (entities.nameEmbedding) {
    const { nameEmbedding, ...rest } = entities;
    return rest;
  }
  
  return entities;
};
