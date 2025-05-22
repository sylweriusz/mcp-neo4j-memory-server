#!/usr/bin/env node
import { extractTags } from '../../src/vector/tags.js';

/**
 * Tag Extraction Test Suite
 * Testing the fix for concatenated phrase bug
 */

const testCases = [
  {
    name: "React.js Project",
    input: "Building React.js application with PostgreSQL database using TypeScript and Vite, implementing Prisma ORM and Redis caching layer",
    expected: ["react.js", "postgresql", "typescript", "vite", "prisma", "redis"]
  },
  {
    name: "CRISPR Research",
    input: "CRISPR-Cas9 gene editing technology for precise DNA targeting in mammalian cells, experimental validation of guide-RNA design for specific genomic loci with minimal off-target effects",
    expected: ["crispr-cas9", "gene", "editing", "dna", "rna", "mammalian", "cells", "genomic"]
  },
  {
    name: "Polish Mobile App",
    input: "Tworzenie aplikacji mobilnej z React Native i Firebase backend dla centrum medycznego w Warszawie",
    expected: ["react", "native", "firebase", "aplikacji", "mobilnej", "centrum", "medycznego", "warszawie"]
  },
  {
    name: "Technical Acronyms",
    input: "Implementing REST API with HTTP/2 support, ES2024 JavaScript features, and OAuth2 authentication",
    expected: ["rest", "api", "http", "es2024", "javascript", "oauth2", "authentication"]
  }
];

console.log("🔍 Tag Extraction Test Suite - Post-Fix Verification\n");

async function runTests() {
  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);
    
    try {
      const tags = await extractTags(testCase.input);
      
      console.log(`Tags (${tags.length}):`, tags);
      
      // Check for concatenated phrases (the bug we're fixing)
      const concatenatedTags = tags.filter(tag => tag.split(/\s+/).length > 2);
      if (concatenatedTags.length > 0) {
        console.error(`❌ FAIL: Found concatenated phrases:`, concatenatedTags);
      } else {
        console.log(`✅ PASS: No concatenated phrases found`);
      }
      
      // Check tag quality
      const goodTags = tags.filter(tag => {
        const words = tag.split(/\s+/);
        return words.length <= 2 && tag.length > 2 && !tag.match(/[.:]+$/);
      });
      
      console.log(`Quality: ${goodTags.length}/${tags.length} tags are atomic and clean`);
      
    } catch (error) {
      console.error(`❌ ERROR:`, error.message);
    }
  }
}

runTests();
