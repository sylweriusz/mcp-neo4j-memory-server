/**
 * Technical Term Detection Service
 * Single responsibility: identify technical patterns in text
 */
export class TechnicalTermDetector {
  private technicalPatterns: RegExp[];

  constructor() {
    this.technicalPatterns = [
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
  }

  extractTechnicalTerms(text: string): string[] {
    const technicalTerms: string[] = [];

    for (const pattern of this.technicalPatterns) {
      const matches = text.match(pattern) || [];
      technicalTerms.push(
        ...matches.map(term => 
          term.toLowerCase().replace(/\//g, '-') // Convert slashes to hyphens
        )
      );
    }

    // Remove duplicates and return
    return [...new Set(technicalTerms)];
  }

  isValidTechnicalTerm(term: string): boolean {
    const cleanTerm = term.toLowerCase().trim();
    
    return cleanTerm.length > 2 && 
           !this.isPureNumber(cleanTerm) &&
           !this.isPunctuation(cleanTerm);
  }

  private isPureNumber(term: string): boolean {
    return /^\d+$/.test(term);
  }

  private isPunctuation(term: string): boolean {
    return /^[.-]+$/.test(term);
  }
}
