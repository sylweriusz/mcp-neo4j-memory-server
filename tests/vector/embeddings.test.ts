/**
 * Vector embedding tests
 */

import { calculateEmbedding, calculateBatchEmbeddings, calculateSimilarity } from '../../src/vector/embeddings';
import { describe, test, expect } from 'vitest';

describe('Vector Embeddings', () => {
  test('calculateEmbedding produces 384-dimension vector', async () => {
    const text = "Test memory";
    const embedding = await calculateEmbedding(text);
    
    expect(embedding).toBeDefined();
    expect(embedding.length).toBe(384);
    expect(typeof embedding[0]).toBe('number');
  });
  
  test('calculateEmbedding handles special characters', async () => {
    const text = "Special & characters! With 123 numbers?";
    const embedding = await calculateEmbedding(text);
    
    expect(embedding).toBeDefined();
    expect(embedding.length).toBe(384);
  });
  
  test('calculateEmbedding throws on empty input', async () => {
    expect.assertions(1);
    try {
      await calculateEmbedding("");
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
  
  test('calculateBatchEmbeddings processes multiple texts', async () => {
    const texts = ["Text one", "Text two", "Text three"];
    const embeddings = await calculateBatchEmbeddings(texts);
    
    expect(embeddings.length).toBe(3);
    expect(embeddings[0].length).toBe(384);
    expect(embeddings[1].length).toBe(384);
    expect(embeddings[2].length).toBe(384);
  });
  
  test('calculateBatchEmbeddings filters empty strings', async () => {
    const texts = ["Valid text", "", "  ", "Another valid"];
    const embeddings = await calculateBatchEmbeddings(texts);
    
    expect(embeddings.length).toBe(2);
  });
  
  test('calculateSimilarity measures vector closeness', () => {
    const vec1 = [1, 0, 0, 0];
    const vec2 = [1, 0, 0, 0];
    const vec3 = [0, 1, 0, 0];
    const vec4 = [-1, 0, 0, 0];
    
    // Same vectors = perfect similarity
    expect(calculateSimilarity(vec1, vec2)).toBe(1);
    
    // Perpendicular vectors = no similarity
    expect(calculateSimilarity(vec1, vec3)).toBe(0);
    
    // Opposite vectors = negative similarity
    expect(calculateSimilarity(vec1, vec4)).toBe(-1);
    
    // Empty or mismatched vectors
    expect(calculateSimilarity([], [])).toBe(0);
    expect(calculateSimilarity(vec1, [])).toBe(0);
    expect(calculateSimilarity(vec1, [1, 0])).toBe(0);
  });
  
  test('calculateSimilarity works with real embeddings', async () => {
    // Similar concepts should have higher similarity
    const dogEmbedding = await calculateEmbedding("dog");
    const catEmbedding = await calculateEmbedding("cat");
    const carEmbedding = await calculateEmbedding("car");
    
    const dogCatSimilarity = calculateSimilarity(dogEmbedding, catEmbedding);
    const dogCarSimilarity = calculateSimilarity(dogEmbedding, carEmbedding);
    
    // Animals should be more similar to each other than to vehicles
    expect(dogCatSimilarity).toBeGreaterThan(dogCarSimilarity);
  });
});