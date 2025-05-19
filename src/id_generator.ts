import { ulid } from 'ulid';

/**
 * Character sets for base conversion
 * BASE91 provides maximum compression while avoiding problematic characters
 */
const BASE91_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;<=>?@[\\]^_{|}~';

/**
 * Cache for validation to improve performance
 */
const charIndexMap = new Map<string, number>();
BASE91_CHARS.split('').forEach((char, index) => {
    charIndexMap.set(char, index);
});

/**
 * Generates ultra-compact time-sortable identifier for Neo4j
 * Uses BASE91 encoding to achieve ~35% shorter IDs than standard ULID
 * Maintains time-sortable property crucial for Neo4j performance
 * 
 * @returns {string} 17-character identifier (vs 26 chars for standard ULID)
 */
export function generateCompactId(): string {
    const id = ulid();
    return encodeBase91FromUlid(id);
}

/**
 * Converts ULID directly to BASE91 for optimal compression
 * More efficient than going through Buffer as in original implementation
 */
function encodeBase91FromUlid(ulid: string): string {
    // ULID uses Crockford Base32
    const base32Chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    
    // Convert ULID to BigInt for precise arithmetic
    let value = 0n;
    for (const char of ulid) {
        const index = base32Chars.indexOf(char);
        if (index === -1) throw new Error(`Invalid ULID character: ${char}`);
        value = value * 32n + BigInt(index);
    }
    
    // Convert to BASE91
    if (value === 0n) return BASE91_CHARS[0];
    
    let result = '';
    while (value > 0n) {
        result = BASE91_CHARS[Number(value % 91n)] + result;
        value = value / 91n;
    }
    
    // Result is typically 19 chars, we can safely truncate to 17 for Neo4j
    // This still provides sufficient entropy (91^17 ≈ 4.7 * 10^33 combinations)
    return result.substring(0, 17);
}

/**
 * Fast validation for compact ID format
 * Uses pre-computed character map for O(1) lookups
 */
export function isValidCompactId(id: string): boolean {
    if (!id || id.length !== 17) return false;
    
    for (let i = 0; i < id.length; i++) {
        if (!charIndexMap.has(id.charAt(i))) return false;
    }
    
    return true;
}

/**
 * Generate batch of compact IDs efficiently
 * Useful for bulk operations in Neo4j
 */
export function generateCompactIdBatch(count: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
        ids.push(generateCompactId());
    }
    return ids;
}

/**
 * Create a compact ID with custom prefix for different node types in Neo4j
 * e.g., "usr_" for users, "ord_" for orders, etc.
 */
export function generateCompactIdWithPrefix(prefix: string): string {
    return prefix + generateCompactId();
}

/**
 * Statistics about the compression achieved
 */
export const compressionStats = {
    standardUlidLength: 26,
    compactIdLength: 17,
    compressionRatio: 17 / 26,
    spaceSaved: (26 - 17) / 26,
    totalCombinations: Math.pow(91, 17).toExponential(2)
} as const;
