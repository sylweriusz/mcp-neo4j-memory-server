/**
 * Linguistic Noun Extraction Service
 * Single responsibility: extract nouns using POS tagging
 */
import nlp from 'compromise';

export class NounExtractionService {
  extractNouns(text: string): string[] {
    if (!text || text.trim() === '') {
      return [];
    }

    try {
      // Process BEFORE lowercasing to preserve proper nouns
      const doc = nlp(text);

      // Extract proper nouns first (people, places, organizations)
      const properNouns = doc
        .people()
        .concat(doc.places())
        .concat(doc.organizations())
        .out('array')
        .filter((noun: string) => noun.length > 2);

      // Extract common nouns and clean them
      const commonNouns = doc
        .nouns()
        .out('array')
        .filter((noun: string) => noun.length > 2)
        .map((noun: string) => this.cleanPunctuation(noun.toLowerCase()));

      // Combine and deduplicate
      const allNouns = [...properNouns, ...commonNouns];
      const deduped = [...new Set(allNouns)].filter(noun => noun.length > 2);
      
      console.error(`[NOUN EXTRACTION] Input: "${text}"`);
      console.error(`[NOUN EXTRACTION] Proper nouns: [${properNouns.join(', ')}]`);
      console.error(`[NOUN EXTRACTION] Common nouns: [${commonNouns.join(', ')}]`);
      console.error(`[NOUN EXTRACTION] Final: [${deduped.join(', ')}]`);
      
      // If compromise.js returns the whole text as one noun, use fallback
      if (deduped.length === 1 && deduped[0].split(' ').length > 3) {
        console.error(`[NOUN EXTRACTION] Compromise returned whole phrase, using fallback`);
        return this.fallbackNounExtraction(text);
      }
      
      return deduped;

    } catch (error) {
      console.warn('Compromise.js extraction failed, using fallback:', error);
      return this.fallbackNounExtraction(text);
    }
  }

  extractCompoundNouns(text: string): string[] {
    try {
      const doc = nlp(text);
      
      // Extract noun phrases that are likely compound terms
      const phrases = doc
        .nouns()
        .filter((phrase: any) => phrase.text().includes(' '))
        .out('array')
        .map((phrase: string) => phrase.toLowerCase().replace(/\s+/g, '-'))
        .filter((phrase: string) => phrase.length > 4);

      return [...new Set(phrases)];
    } catch (error) {
      return [];
    }
  }

  private fallbackNounExtraction(text: string): string[] {
    // Unicode-aware regex-based fallback if compromise fails
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map(word => this.cleanPunctuation(word))
      .filter(word => word.length > 2 && /^[\p{L}]+$/u.test(word));

    console.error(`[NOUN EXTRACTION] Fallback extracted: [${words.join(', ')}]`);
    return [...new Set(words)];
  }

  private cleanPunctuation(text: string): string {
    // Remove leading/trailing punctuation and internal punctuation - Unicode-aware
    return text
      .replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, '')
      .replace(/[,;:!?'"()[\]{}]/g, '');
  }
}
