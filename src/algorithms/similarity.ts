import { FeatureVector } from '../types';

// Simple cosine similarity implementation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

export class SimilarityCalculator {
  /**
   * Calculate cosine similarity between two feature vectors
   * Returns a value between 0 and 1 (1 = identical, 0 = completely different)
   */
  cosineSimilarity(vectorA: FeatureVector, vectorB: FeatureVector): number {
    if (vectorA.features.length !== vectorB.features.length) {
      throw new Error('Feature vectors must have the same length');
    }

    // Calculate cosine similarity (returns value between 0 and 1)
    const similarity = cosineSimilarity(vectorA.features, vectorB.features);

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * Find top N most similar products to the target
   */
  findTopSimilar(
    target: FeatureVector,
    candidates: FeatureVector[],
    topN: number,
    minScore: number = 0
  ): Array<{ _id: string; score: number }> {
    const similarities = candidates
      .filter((candidate) => candidate._id !== target._id)
      .map((candidate) => ({
        _id: candidate._id,
        score: this.cosineSimilarity(target, candidate),
      }))
      .filter((item) => item.score >= minScore);

    // Sort by score descending and take top N
    return similarities.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  /**
   * Batch compute similarity matrix for all products
   * Returns a map of _id -> list of similar products with scores
   */
  computeSimilarityMatrix(
    vectors: FeatureVector[],
    topN: number,
    minScore: number
  ): Map<string, Array<{ _id: string; score: number }>> {
    const matrix = new Map<string, Array<{ _id: string; score: number }>>();

    for (const vector of vectors) {
      const similar = this.findTopSimilar(vector, vectors, topN, minScore);
      matrix.set(vector._id, similar);
    }

    return matrix;
  }
}
