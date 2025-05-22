/**
 * Enhanced Tag Management Module v2.0
 * Based on 07f57051 with improvements:
 * - Built-in universal stopwords for multilingual support
 * - compromise.js for POS tagging and noun extraction  
 * - Enhanced technical term detection
 * - Preserved semantic deduplication with embeddings
 * - Universal stopwords (no language detection needed)
 */

import { Session } from 'neo4j-driver';
import { calculateEmbedding, calculateSimilarity } from './embeddings.js';
import nlp from 'compromise';
import { getCombinedStopwords } from './data/index.ts';
// Current model version for cache invalidation
const EMBEDDING_MODEL_VERSION = 'xenova-minilm-l6-v2-v1';

// Default languages for stopword filtering
const DEFAULT_LANGUAGES = [
  // Tier 1: Major Languages (1B+ speakers)
  'zh', 'en', 'hi', 'es', 'ar', 'pt', 'ru',
  
  // Tier 2: Regional Powers (100M+ speakers) 
  'bn', 'ja', 'de', 'fr', 'it', 'pl',
  
  // Tier 3: Strategic Languages (50M+ speakers)
  'vi', 'ko', 'mr', 'tr', 'ur', 'gu', 
  'uk', 'fa', 'th', 'nl', 'sw',
  
  // Tier 4: Tech Hubs & Regional
  'sv', 'da', 'no', 'fi', 'he', 'cs', 'hu', 'id'
];

// Cache for loaded stopwords to avoid repeated async calls
let cachedStopwords: Set<string> | null = null;

// Initialize stopwords immediately to avoid race conditions
const initializeStopwords = async () => {
  try {
    cachedStopwords = await getCombinedStopwords(DEFAULT_LANGUAGES);
  } catch (error) {
    console.error('Failed to load multilingual stopwords:', error);
  }
};

// Start loading immediately
initializeStopwords();

// Types for internal tag processing
interface TermStats {
  term: string;
  tf: number;      // Term frequency in document
  tfidf: number;   // TF-IDF score  
}

interface CandidateTag {
  term: string;
  score: number;
}

/**
 * Get multilingual stopwords using extracted data
 * Covers 20,000+ stopwords across 52 languages
 */
async function getMultilingualStopwords(): Promise<Set<string>> {
  if (cachedStopwords) {
    return cachedStopwords;
  }
  
  try {
    // Load stopwords for default languages
    cachedStopwords = await getCombinedStopwords(DEFAULT_LANGUAGES);
    return cachedStopwords;
  } catch (error) {
    console.error('Failed to load multilingual stopwords:', error);
    throw error;
  }
}

/**
 * Calculate TF-IDF for terms in a document
 * For single document, simplified to term frequency
 */
function calculateTFIDF(terms: string[]): TermStats[] {
  if (terms.length === 0) return [];
  
  const termCounts = new Map<string, number>();
  terms.forEach(term => {
    termCounts.set(term, (termCounts.get(term) || 0) + 1);
  });
  
  return Array.from(termCounts.entries()).map(([term, count]) => ({
    term,
    tf: count / terms.length,
    tfidf: count / terms.length // Simplified for single document
  }));
}

/**
 * Extract nouns using compromise.js POS tagging
 * Fixed sequence: extract proper nouns BEFORE lowercasing
 */
function extractNounsAdvanced(text: string): string[] {
  try {
    // Get cached stopwords - if they're not loaded, we fail clean
    const stopWords = cachedStopwords;
    
    if (!stopWords) {
      console.error('❌ Cached stopwords not loaded - cannot extract tags safely');
      return [];
    }
    
    // Comprehensive punctuation removal regex
    const cleanPunctuation = (text: string): string => 
      text.replace(/^[^\w]+|[^\w]+$/g, '').replace(/[,;:!?'"()[\]{}]/g, '');
    
    // Process BEFORE lowercasing to preserve proper nouns
    const doc = nlp(text);
    
    // 1. Extract proper nouns FIRST (only keep recognized entities)
    const properNouns = doc.people().concat(doc.places()).concat(doc.organizations())
      .out('array')
      .filter(noun => noun.length > 2)
      .map(noun => cleanPunctuation(noun))
      .flatMap(phrase => phrase.split(/\s+/))
      .map(noun => noun.toLowerCase())
      .filter(noun => noun.length > 2)
      .filter(noun => !stopWords.has(noun));
    
    // 2. Extract common nouns
    const commonNouns = doc.nouns().out('array')
      .filter(noun => noun.length > 2)
      .map(noun => noun.toLowerCase())
      .map(noun => cleanPunctuation(noun))
      .flatMap(phrase => phrase.split(/\s+/))
      .filter(noun => noun.length > 2)
      .filter(noun => !noun.match(/^.+ing$/))
      .filter(noun => !stopWords.has(noun));
    
    // 3. Combine and deduplicate
    return [...new Set([...properNouns, ...commonNouns])];
  } catch (error) {
    console.error('compromise.js failed:', error);
    return [];
  }
}


/**
 * Extract keywords with enhanced technical term detection
 * Uses professional multilingual stopwords from extraction
 */
async function extractKeywordsAdvanced(text: string): Promise<string[]> {
  // 1. Get multilingual stopwords from professional extraction
  const stopWords = await getMultilingualStopwords();
  
  // 2. Enhanced tokenization preserving technical terms
  const words = text.toLowerCase()
    .replace(/[^\w\sąćęłńóśźż.-]/g, ' ')  // Keep dots and hyphens for technical terms
    .split(/\s+/)
    .map(word => word.replace(/^[-.:]+|[-.:]+$/g, '')) // Remove leading/trailing punctuation
    .filter(word => {
      // Filter out stop words more strictly
      const cleanWord = word.toLowerCase().trim();
      return cleanWord.length > 2 && 
        !stopWords.has(cleanWord) &&  // Check against cleaned, lowercased word
        !/^\d+$/.test(cleanWord) &&
        !cleanWord.match(/^[.-]+$/) && // Remove punctuation-only tokens
        !cleanWord.match(/^.+ing$/) && // Filter out gerunds like "implementing"
        cleanWord !== 'and';  // Explicit filter for stubborn stop words
    });
  
  // 3. Enhanced technical term detection patterns
  const technicalPatterns = [
    // Framework/Library patterns
    /\b[A-Z][a-zA-Z]*\.js\b/g,              // React.js, Vue.js, Node.js
    /\b[A-Z][a-zA-Z]*\.[a-zA-Z]+\b/g,       // TensorFlow.js, D3.js
    
    // Scientific terms
    /\b[A-Z]{3,}-[A-Z][a-z0-9]+\b/g,        // CRISPR-Cas9, RNA-seq
    /\b[A-Z][a-zA-Z]+-[A-Z][a-zA-Z]+\b/g,   // Weber-Schmidt
    
    // Technical acronyms
    /\b[A-Z]{2,}\d*\b/g,                     // API, HTTP, ES2024
    
    // Version patterns
    /\b[A-Za-z]+\s*\d+(\.\d+)*\b/g,         // Python 3.9, ES2024
    
    // Compound terms with hyphens or slashes
    /\b[a-zA-Z]+-[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g,  // machine-learning, real-time
    /\b[a-zA-Z]+\/[a-zA-Z]+\b/g                 // async/await
  ];
  
  const technicalTerms: string[] = [];
  technicalPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    technicalTerms.push(...matches.map(term => term.toLowerCase().replace(/\//g, '-'))); // Convert slashes to hyphens
  });
  
  // Combine with original case preservation for technical terms
  const allTerms = [...new Set([
    ...words,
    ...technicalTerms
  ])];
  
  // Filter out duplicates and clean up - STRICT stop word enforcement
  return allTerms.filter(term => {
    // Remove terms that are just punctuation or too short
    const cleaned = term.replace(/^[-.:]+|[-.:]+$/g, '').toLowerCase().trim();
    
    // Extra strict stop word check
    const isStopWord = stopWords.has(cleaned) || 
                      cleaned === 'and' || 
                      cleaned === 'or' || 
                      cleaned === 'but' ||
                      cleaned === 'the' ||
                      cleaned === 'is' ||
                      cleaned === 'are' ||
                      cleaned === 'was' ||
                      cleaned === 'were';
    
    return cleaned.length > 2 && 
           !isStopWord &&
           !/^\d+$/.test(cleaned) &&
           !cleaned.match(/^[.-]+$/) &&
           !cleaned.match(/^.+ing$/); // Filter gerunds
  });
}

/**
 * Get embeddings for multiple tags with database cache
 * (Preserved from original implementation)
 */
async function getTagEmbeddings(
  session: Session,
  tagNames: string[]
): Promise<Map<string, number[]>> {
  if (tagNames.length === 0) {
    return new Map();
  }

  const embeddingMap = new Map<string, number[]>();
  
  try {
    // Step 1: Get all cached embeddings in a single query
    const result = await session.run(
      `MATCH (t:Tag)
       WHERE t.name IN $tagNames 
         AND t.embedding IS NOT NULL
         AND t.embeddingVersion = $version
       RETURN t.name AS name, t.embedding AS embedding`,
      { tagNames, version: EMBEDDING_MODEL_VERSION }
    );

    // Collect cached embeddings
    const cachedTags = new Set<string>();
    for (const record of result.records) {
      const name = record.get('name');
      const embedding = record.get('embedding');
      if (embedding && Array.isArray(embedding)) {
        embeddingMap.set(name, embedding);
        cachedTags.add(name);
      }
    }

    // Step 2: Calculate embeddings for missing tags
    const missingTags = tagNames.filter(name => !cachedTags.has(name));
    
    if (missingTags.length > 0) {
      // Calculate embeddings in parallel
      const newEmbeddings = await Promise.all(
        missingTags.map(async (tagName) => ({
          name: tagName,
          embedding: await calculateEmbedding(tagName)
        }))
      );

      // Step 3: Store new embeddings (single transaction)
      if (newEmbeddings.length > 0) {
        const tx = session.beginTransaction();
        try {
          for (const { name, embedding } of newEmbeddings) {
            embeddingMap.set(name, embedding);
            
            await tx.run(
              `MERGE (t:Tag {name: $tagName})
               SET t.embedding = $embedding,
                   t.embeddingVersion = $version,
                   t.calculatedAt = datetime()`,
              { 
                tagName: name, 
                embedding,
                version: EMBEDDING_MODEL_VERSION
              }
            );
          }
          await tx.commit();
        } catch (error) {
          await tx.rollback();
          throw error;
        }
      }
    }

    return embeddingMap;
  } catch (error) {
    console.error('❌ Error getting tag embeddings:', error);
    throw error;
  }
}

/**
 * Semantic deduplication using database-cached embeddings
 * (Preserved from original implementation)
 */
export async function semanticDeduplicationWithCache(
  session: Session,
  candidates: string[], 
  threshold: number = 0.75
): Promise<string[]> {
  if (candidates.length <= 1) return candidates;
  
  try {
    // PHASE 1: Remove exact substring duplicates
    const filteredCandidates = [];
    
    for (const candidate of candidates) {
      const candidateWords = candidate.split(/\s+/);
      let isSubstring = false;
      
      // Check if this candidate is a substring of any other candidate
      for (const other of candidates) {
        if (candidate !== other && other.includes(candidate)) {
          // If it's a single word and contained in a multi-word phrase, skip it
          if (candidateWords.length === 1 && other.split(/\s+/).length > 1) {
            isSubstring = true;
            break;
          }
        }
      }
      
      if (!isSubstring) {
        filteredCandidates.push(candidate);
      }
    }
    
    // PHASE 2: Get all embeddings at once for semantic similarity
    const embeddingMap = await getTagEmbeddings(session, filteredCandidates);
    
    // PHASE 3: Semantic deduplication on remaining candidates
    const final: string[] = [];
    
    for (const candidate of filteredCandidates) {
      const candidateEmbedding = embeddingMap.get(candidate);
      
      if (!candidateEmbedding) {
        continue; // Skip if embedding couldn't be calculated
      }
      
      let isDuplicate = false;
      
      // Check similarity with already selected terms
      for (const selected of final) {
        const selectedEmbedding = embeddingMap.get(selected);
        
        if (selectedEmbedding) {
          const similarity = calculateSimilarity(
            candidateEmbedding, 
            selectedEmbedding
          );
          
          if (similarity > threshold) {
            // Keep the longer/more specific term
            if (candidate.length > selected.length) {
              // Replace selected with candidate
              const index = final.indexOf(selected);
              final[index] = candidate;
            }
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (!isDuplicate) {
        final.push(candidate);
      }
    }
    
    return final;
  } catch (error) {
    console.error('❌ Error in cached semantic deduplication:', error);
    throw error;
  }
}

/**
 * Enhanced tag extraction with compromise.js POS tagging
 * Uses professional multilingual stopwords from extraction
 */
export async function extractTags(text: string, session?: Session): Promise<string[]> {
  if (!text || text.trim() === '') {
    return [];
  }
  
  try {
    // 0. Ensure stopwords are loaded before ANY extraction
    await getMultilingualStopwords();
    
    // 1. Extract keywords using professional stopwords operation
    const keywords = await extractKeywordsAdvanced(text);
    
    // 2. Extract nouns using compromise.js (with regex fallback)
    const nouns = extractNounsAdvanced(text);
    
    // 3. TF-IDF scoring for keywords
    const keywordStats = calculateTFIDF(keywords);
    
    // 4. Combine keywords and nouns with scores
    const candidates: CandidateTag[] = [
      // Keywords with TF-IDF scores
      ...keywordStats.map(stat => ({
        term: stat.term,
        score: stat.tfidf
      })),
      // Nouns with boost (as they're often more meaningful)
      ...nouns.map(noun => ({
        term: noun,
        score: 1.5 // Boost for compound nouns and proper nouns
      }))
    ];
    
    // 5. Sort by score and take top candidates
    const topCandidates = candidates
      .filter(c => !c.term.match(/^.+ing$/)) // Final gerund filter
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)  // More candidates for deduplication
      .map(c => c.term);
    
    // 6. Semantic deduplication using cached embeddings
    let deduplicatedTags: string[];
    if (session) {
      deduplicatedTags = await semanticDeduplicationWithCache(session, topCandidates, 0.75);
    } else {
      // Simple deduplication fallback
      deduplicatedTags = [...new Set(topCandidates)];
    }
    
    // 7. Return top 6 quality tags
    return deduplicatedTags.slice(0, 6);
    
  } catch (error) {
    console.error('❌ Error extracting tags:', error);
    return [];
  }
}

/**
 * Legacy semantic deduplication (fallback when no session provided)
 * Calculates embeddings on the fly
 */
async function semanticDeduplication(
  candidates: string[], 
  threshold: number = 0.75
): Promise<string[]> {
  if (candidates.length <= 1) return candidates;
  
  try {
    // PHASE 1: Remove exact substring duplicates
    const filteredCandidates = [];
    
    for (const candidate of candidates) {
      const candidateWords = candidate.split(/\s+/);
      let isSubstring = false;
      
      for (const other of candidates) {
        if (candidate !== other && other.includes(candidate)) {
          if (candidateWords.length === 1 && other.split(/\s+/).length > 1) {
            isSubstring = true;
            break;
          }
        }
      }
      
      if (!isSubstring) {
        filteredCandidates.push(candidate);
      }
    }
    
    // PHASE 2: Calculate embeddings for filtered candidates  
    const candidatesWithEmbeddings = await Promise.all(
      filteredCandidates.map(async candidate => ({
        term: candidate,
        embedding: await calculateEmbedding(candidate)
      }))
    );
    
    // PHASE 3: Semantic deduplication
    const final: string[] = [];
    
    for (const candidate of candidatesWithEmbeddings) {
      let isDuplicate = false;
      
      // Check similarity with already selected terms
      for (const selected of final) {
        const selectedEmbedding = candidatesWithEmbeddings
          .find(c => c.term === selected)?.embedding;
        
        if (selectedEmbedding) {
          const similarity = calculateSimilarity(
            candidate.embedding, 
            selectedEmbedding
          );
          
          if (similarity > threshold) {
            // Keep the longer/more specific term
            if (candidate.term.length > selected.length) {
              const index = final.indexOf(selected);
              final[index] = candidate.term;
            }
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (!isDuplicate) {
        final.push(candidate.term);
      }
    }
    
    return final;
  } catch (error) {
    console.error('❌ Error in semantic deduplication:', error);
    // Fallback with substring filtering
    const filtered = [];
    for (const candidate of candidates) {
      const candidateWords = candidate.split(/\s+/);
      let isSubstring = false;
      
      for (const other of candidates) {
        if (candidate !== other && other.includes(candidate)) {
          if (candidateWords.length === 1 && other.split(/\s+/).length > 1) {
            isSubstring = true;
            break;
          }
        }
      }
      
      if (!isSubstring) {
        filtered.push(candidate);
      }
    }
    return Array.from(new Set(filtered));
  }
}

/**
 * Update memory tags based on name and observations
 * (Preserved from original implementation)
 */
export async function updateMemoryTags(
  session: Session,
  memoryId: string, 
  memoryName: string,
  observations: string[] | Array<{content: string, createdAt: string}> = []
): Promise<void> {
  try {
    // Get existing tags for this memory to maintain consistency
    const existingTagsResult = await session.run(
      `MATCH (m:Memory {id: $memoryId})-[:HAS_TAG]->(t:Tag)
       RETURN collect(t.name) AS existingTags`,
      { memoryId }
    );
    
    const existingTags = existingTagsResult.records[0]?.get('existingTags') || [];
    
    // Extract tags from memory name (weight: 60%)
    const nameTags = await extractTags(memoryName, session);
    
    // Extract tags from observations (weight: 40%)
    const observationText = Array.isArray(observations) 
      ? observations.map(obs => typeof obs === 'string' ? obs : obs.content).join(' ')
      : observations.join(' ');
    
    const observationTags = observationText.trim() 
      ? await extractTags(observationText, session)
      : [];
    
    // Combine and weight tags (target: 6 total)
    const weightedCandidates = [
      ...nameTags.map(tag => ({ tag, weight: 1.5 })),      // Name priority
      ...observationTags.map(tag => ({ tag, weight: 1.0 })) // Observation support
    ];
    
    // Combine with existing tags and create candidate list
    const candidateNames = [
      ...existingTags,
      ...weightedCandidates.sort((a, b) => b.weight - a.weight).map(c => c.tag)
    ];
    
    // Semantic deduplication and selection (maximum 6 tags)
    const finalTags = await semanticDeduplicationWithCache(session, candidateNames, 0.75);
    
    // Limit to 6 tags maximum
    const limitedTags = finalTags.slice(0, 6);
    
    // Only update if there's a meaningful change  
    if (limitedTags.length > 0) {
      // Update tags in database
      await session.run(
        `MATCH (m:Memory {id: $memoryId})
         SET m.tags = $tags
         WITH m
         
         // Clear existing tag relationships
         OPTIONAL MATCH (m)-[r:HAS_TAG]->()
         DELETE r
         
         WITH m
         
         // Create tag nodes and relationships
         UNWIND $tags as tagName
         MERGE (t:Tag {name: tagName})
         MERGE (m)-[:HAS_TAG]->(t)`,
        { memoryId, tags: limitedTags }
      );
    }
  } catch (error) {
    console.error(`❌ Error updating tags for memory ${memoryId}:`, error);
    throw error;
  }
}

/**
 * Get all tags with usage count
 */
export async function getAllTags(session: Session): Promise<{name: string, count: number}[]> {
  const result = await session.run(
    `MATCH (t:Tag)<-[:HAS_TAG]-(m:Memory)
     RETURN t.name AS name, count(m) AS count
     ORDER BY count DESC`
  );
  
  return result.records.map(record => ({
    name: record.get('name'),
    count: record.get('count').toNumber()
  }));
}

/**
 * Get tags for specific memory
 */
export async function getMemoryTags(session: Session, memoryId: string): Promise<string[]> {
  const result = await session.run(
    `MATCH (m:Memory {id: $memoryId})-[:HAS_TAG]->(t:Tag)
     RETURN t.name AS tagName`,
    { memoryId }
  );
  
  return result.records.map(record => record.get('tagName'));
}

/**
 * Clear invalid tag embeddings (for model upgrades)
 */
export async function clearInvalidTagEmbeddings(
  session: Session,
  version: string = EMBEDDING_MODEL_VERSION
): Promise<number> {
  const result = await session.run(
    `MATCH (t:Tag)
     WHERE t.embeddingVersion IS NULL 
        OR t.embeddingVersion <> $version
     SET t.embedding = null,
         t.embeddingVersion = null,
         t.calculatedAt = null
     RETURN count(t) AS cleared`,
    { version }
  );
  
  const cleared = result.records[0]?.get('cleared')?.toNumber() || 0;
  //console.log(`🧹 Cleared ${cleared} invalid tag embeddings`);
  return cleared;
}

/**
 * Get cache statistics
 */
export async function getTagEmbeddingStats(session: Session): Promise<{
  totalTags: number;
  cachedEmbeddings: number;
  cacheHitRate: number;
}> {
  const result = await session.run(
    `MATCH (t:Tag)
     RETURN count(t) AS totalTags,
            sum(CASE WHEN t.embedding IS NOT NULL 
                     AND t.embeddingVersion = $version 
                     THEN 1 ELSE 0 END) AS cachedEmbeddings`,
    { version: EMBEDDING_MODEL_VERSION }
  );
  
  const totalTags = result.records[0]?.get('totalTags')?.toNumber() || 0;
  const cachedEmbeddings = result.records[0]?.get('cachedEmbeddings')?.toNumber() || 0;
  const cacheHitRate = totalTags > 0 ? (cachedEmbeddings / totalTags) * 100 : 0;
  
  return {
    totalTags,
    cachedEmbeddings,
    cacheHitRate: Math.round(cacheHitRate * 100) / 100
  };
}