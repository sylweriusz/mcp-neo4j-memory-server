#!/usr/bin/env node
import { extractTags } from '../../dist/chunk-DLJ7HINL.mjs';

/**
 * Tag Extraction Test Suite - Testing against built code
 */

const testCases = [
  {
    name: "React.js Project",
    input: "Building React.js application with PostgreSQL database using TypeScript and Vite",
    maxAcceptablePhraseLength: 2  // compound terms like "react.js" are OK
  },
  {
    name: "CRISPR Research", 
    input: "CRISPR-Cas9 gene editing technology for precise DNA targeting",
    maxAcceptablePhraseLength: 2
  },
  {
    name: "Technical Mix",
    input: "REST API with HTTP/2 support and OAuth2 authentication",
    maxAcceptablePhraseLength: 2
  }
];

console.log("🔍 Tag Extraction Test - Post-Fix Verification\n");

async function runTests() {
  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);
    
    try {
      const tags = await extractTags(testCase.input);
      
      console.log(`Tags (${tags.length}):`, tags);
      
      // Check for concatenated phrases
      const problematicTags = tags.filter(tag => {
        const wordCount = tag.split(/\s+/).length;
        return wordCount > testCase.maxAcceptablePhraseLength;
      });
      
      if (problematicTags.length > 0) {
        console.error(`❌ FAIL: Found overly concatenated tags:`, problematicTags);
      } else {
        console.log(`✅ PASS: All tags are atomic or reasonable compounds`);
      }
      
    } catch (error) {
      console.error(`❌ ERROR:`, error.message);
    }
  }
}

runTests().catch(console.error);
