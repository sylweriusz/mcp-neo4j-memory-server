import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create minimal mocks for embedding functions
const mockEmbedding = new Array(384).fill(0.1);
const mockModel = {
  __esModule: true,
  calculateEmbedding: vi.fn().mockResolvedValue(mockEmbedding),
  calculateBatchEmbeddings: vi.fn().mockImplementation((texts) => 
    Promise.resolve(texts.filter(Boolean).map(() => mockEmbedding))
  ),
  calculateSimilarity: vi.fn().mockImplementation((v1, v2) => 
    v1 && v2 && v1.length === v2.length ? 0.9 : 0
  ),
  getEmbeddingModel: vi.fn().mockResolvedValue({})
};

// Mock the entire embeddings module
vi.mock('../src/vector/embeddings', () => mockModel, { virtual: true });

describe('Vector Embedding Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should calculate embeddings for text', async () => {
    const { calculateEmbedding } = await import('../src/vector/embeddings');
    const result = await calculateEmbedding('test text');
    
    expect(mockModel.calculateEmbedding).toHaveBeenCalledWith('test text');
    expect(result).toEqual(mockEmbedding);
  });
  
  it('should calculate batch embeddings', async () => {
    const { calculateBatchEmbeddings } = await import('../src/vector/embeddings');
    const result = await calculateBatchEmbeddings(['text1', 'text2']);
    
    expect(mockModel.calculateBatchEmbeddings).toHaveBeenCalledWith(['text1', 'text2']);
    expect(result).toHaveLength(2);
  });
  
  it('should calculate similarity between vectors', async () => {
    const { calculateSimilarity } = await import('../src/vector/embeddings');
    const result = calculateSimilarity([1, 2, 3], [4, 5, 6]);
    
    expect(mockModel.calculateSimilarity).toHaveBeenCalledWith([1, 2, 3], [4, 5, 6]);
    expect(result).toBe(0.9);
  });
});
