import '../test/test-env'; // Load test environment first
import { SimilarityCalculator } from '../algorithms/similarity';
import { FeatureVector } from '../types';

describe('SimilarityCalculator', () => {
  let calculator: SimilarityCalculator;

  beforeEach(() => {
    calculator = new SimilarityCalculator();
  });

  it('should calculate cosine similarity correctly', () => {
    const vectorA: FeatureVector = {
      productId: 'P001',
      features: [1, 0, 0],
      presenceIndicators: [1, 1, 1],
      normalized: true,
    };

    const vectorB: FeatureVector = {
      productId: 'P002',
      features: [1, 0, 0],
      presenceIndicators: [1, 1, 1],
      normalized: true,
    };

    const similarity = calculator.cosineSimilarity(vectorA, vectorB);

    expect(similarity).toBeCloseTo(1.0, 2); // Identical vectors
  });

  it('should return 0 for orthogonal vectors', () => {
    const vectorA: FeatureVector = {
      productId: 'P001',
      features: [1, 0],
      presenceIndicators: [1, 1],
      normalized: true,
    };

    const vectorB: FeatureVector = {
      productId: 'P002',
      features: [0, 1],
      presenceIndicators: [1, 1],
      normalized: true,
    };

    const similarity = calculator.cosineSimilarity(vectorA, vectorB);

    expect(similarity).toBeCloseTo(0.0, 2);
  });

  it('should find top N similar products', () => {
    const target: FeatureVector = {
      productId: 'P001',
      features: [1, 0, 0],
      presenceIndicators: [1, 1, 1],
      normalized: true,
    };

    const candidates: FeatureVector[] = [
      {
        productId: 'P002',
        features: [0.9, 0.1, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      },
      {
        productId: 'P003',
        features: [0, 1, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      },
      {
        productId: 'P004',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      },
    ];

    const topSimilar = calculator.findTopSimilar(target, candidates, 2);

    expect(topSimilar).toHaveLength(2);
    expect(topSimilar[0].productId).toBe('P004'); // Most similar
    expect(topSimilar[0].score).toBeGreaterThan(0.9);
  });

  it('should filter by minimum score', () => {
    const target: FeatureVector = {
      productId: 'P001',
      features: [1, 0, 0],
      presenceIndicators: [1, 1, 1],
      normalized: true,
    };

    const candidates: FeatureVector[] = [
      {
        productId: 'P002',
        features: [0.5, 0.5, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      },
    ];

    const topSimilar = calculator.findTopSimilar(target, candidates, 10, 0.8);

    expect(topSimilar).toHaveLength(0); // Filtered out by minScore
  });

  describe('cosineSimilarity edge cases', () => {
    it('should throw error for vectors with different lengths', () => {
      const vectorA: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const vectorB: FeatureVector = {
        productId: 'P002',
        features: [1, 0],
        presenceIndicators: [1, 1],
        normalized: true,
      };

      expect(() => calculator.cosineSimilarity(vectorA, vectorB)).toThrow(
        'Feature vectors must have the same length'
      );
    });

    it('should handle zero vectors', () => {
      const vectorA: FeatureVector = {
        productId: 'P001',
        features: [0, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const vectorB: FeatureVector = {
        productId: 'P002',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const similarity = calculator.cosineSimilarity(vectorA, vectorB);
      expect(similarity).toBe(0);
    });

    it('should handle negative values and clamp to 0-1 range', () => {
      const vectorA: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const vectorB: FeatureVector = {
        productId: 'P002',
        features: [-1, 0, 0], // Opposite direction
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const similarity = calculator.cosineSimilarity(vectorA, vectorB);
      // Should be clamped to 0 (not negative)
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should calculate similarity for high-dimensional vectors', () => {
      const vectorA: FeatureVector = {
        productId: 'P001',
        features: [1, 2, 3, 4, 5],
        presenceIndicators: [1, 1, 1, 1, 1],
        normalized: false,
      };

      const vectorB: FeatureVector = {
        productId: 'P002',
        features: [1, 2, 3, 4, 5],
        presenceIndicators: [1, 1, 1, 1, 1],
        normalized: false,
      };

      const similarity = calculator.cosineSimilarity(vectorA, vectorB);
      expect(similarity).toBeCloseTo(1.0, 2);
    });

    it('should handle partially similar vectors', () => {
      const vectorA: FeatureVector = {
        productId: 'P001',
        features: [1, 1, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const vectorB: FeatureVector = {
        productId: 'P002',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const similarity = calculator.cosineSimilarity(vectorA, vectorB);
      // Should be between 0 and 1
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should handle vectors with decimal values', () => {
      const vectorA: FeatureVector = {
        productId: 'P001',
        features: [0.5, 0.3, 0.2],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const vectorB: FeatureVector = {
        productId: 'P002',
        features: [0.4, 0.3, 0.3],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const similarity = calculator.cosineSimilarity(vectorA, vectorB);
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('findTopSimilar edge cases', () => {
    it('should exclude target product from results', () => {
      const target: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const candidates: FeatureVector[] = [
        target, // Target itself
        {
          productId: 'P002',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const topSimilar = calculator.findTopSimilar(target, candidates, 10);
      expect(topSimilar).toHaveLength(1);
      expect(topSimilar[0].productId).toBe('P002');
      expect(topSimilar.every((item) => item.productId !== target.productId)).toBe(true);
    });

    it('should handle empty candidates array', () => {
      const target: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const topSimilar = calculator.findTopSimilar(target, [], 10);
      expect(topSimilar).toHaveLength(0);
    });

    it('should handle topN larger than available candidates', () => {
      const target: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const candidates: FeatureVector[] = [
        {
          productId: 'P002',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const topSimilar = calculator.findTopSimilar(target, candidates, 10);
      expect(topSimilar).toHaveLength(1);
    });

    it('should sort results by score descending', () => {
      const target: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const candidates: FeatureVector[] = [
        {
          productId: 'P002',
          features: [0.5, 0.5, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P003',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P004',
          features: [0.7, 0.3, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const topSimilar = calculator.findTopSimilar(target, candidates, 10);
      expect(topSimilar.length).toBeGreaterThan(1);
      // Verify descending order
      for (let i = 0; i < topSimilar.length - 1; i++) {
        expect(topSimilar[i].score).toBeGreaterThanOrEqual(topSimilar[i + 1].score);
      }
    });

    it('should handle minScore of 0 (no filtering)', () => {
      const target: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const candidates: FeatureVector[] = [
        {
          productId: 'P002',
          features: [0.1, 0.9, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const topSimilar = calculator.findTopSimilar(target, candidates, 10, 0);
      expect(topSimilar).toHaveLength(1);
    });

    it('should handle minScore of 1 (very strict)', () => {
      const target: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const candidates: FeatureVector[] = [
        {
          productId: 'P002',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P003',
          features: [1, 0, 0], // Identical
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const topSimilar = calculator.findTopSimilar(target, candidates, 10, 1.0);
      // Only identical vector should pass (but it's excluded as target)
      expect(topSimilar.length).toBeLessThanOrEqual(1);
    });

    it('should handle topN of 0', () => {
      const target: FeatureVector = {
        productId: 'P001',
        features: [1, 0, 0],
        presenceIndicators: [1, 1, 1],
        normalized: true,
      };

      const candidates: FeatureVector[] = [
        {
          productId: 'P002',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const topSimilar = calculator.findTopSimilar(target, candidates, 0);
      expect(topSimilar).toHaveLength(0);
    });
  });

  describe('computeSimilarityMatrix', () => {
    it('should compute similarity matrix for all vectors', () => {
      const vectors: FeatureVector[] = [
        {
          productId: 'P001',
          features: [1, 0, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P002',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P003',
          features: [0, 1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const matrix = calculator.computeSimilarityMatrix(vectors, 2, 0);

      expect(matrix.size).toBe(3);
      expect(matrix.has('P001')).toBe(true);
      expect(matrix.has('P002')).toBe(true);
      expect(matrix.has('P003')).toBe(true);
    });

    it('should respect topN parameter', () => {
      const vectors: FeatureVector[] = [
        {
          productId: 'P001',
          features: [1, 0, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P002',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P003',
          features: [0.8, 0.2, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P004',
          features: [0.7, 0.3, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const matrix = calculator.computeSimilarityMatrix(vectors, 2, 0);

      // Each product should have at most 2 similar products
      for (const similar of matrix.values()) {
        expect(similar.length).toBeLessThanOrEqual(2);
      }
    });

    it('should respect minScore parameter', () => {
      const vectors: FeatureVector[] = [
        {
          productId: 'P001',
          features: [1, 0, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P002',
          features: [0.1, 0.9, 0], // Low similarity
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P003',
          features: [0.9, 0.1, 0], // High similarity
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const matrix = calculator.computeSimilarityMatrix(vectors, 10, 0.5);

      // P001 should only have P003 (high similarity), not P002 (low similarity)
      const p001Similar = matrix.get('P001') || [];
      const p002InResults = p001Similar.some((item) => item.productId === 'P002');
      const p003InResults = p001Similar.some((item) => item.productId === 'P003');

      expect(p002InResults).toBe(false);
      expect(p003InResults).toBe(true);
    });

    it('should handle empty vectors array', () => {
      const matrix = calculator.computeSimilarityMatrix([], 10, 0);
      expect(matrix.size).toBe(0);
    });

    it('should handle single vector', () => {
      const vectors: FeatureVector[] = [
        {
          productId: 'P001',
          features: [1, 0, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const matrix = calculator.computeSimilarityMatrix(vectors, 10, 0);
      expect(matrix.size).toBe(1);
      expect(matrix.get('P001')).toEqual([]); // No other vectors to compare
    });

    it('should exclude self from similarity results', () => {
      const vectors: FeatureVector[] = [
        {
          productId: 'P001',
          features: [1, 0, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P002',
          features: [0.9, 0.1, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const matrix = calculator.computeSimilarityMatrix(vectors, 10, 0);

      const p001Similar = matrix.get('P001') || [];
      expect(p001Similar.every((item) => item.productId !== 'P001')).toBe(true);
    });

    it('should compute correct similarity scores in matrix', () => {
      const vectors: FeatureVector[] = [
        {
          productId: 'P001',
          features: [1, 0, 0],
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P002',
          features: [1, 0, 0], // Identical to P001
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
        {
          productId: 'P003',
          features: [0, 1, 0], // Orthogonal
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      const matrix = calculator.computeSimilarityMatrix(vectors, 10, 0);

      const p001Similar = matrix.get('P001') || [];
      const p002Entry = p001Similar.find((item) => item.productId === 'P002');
      const p003Entry = p001Similar.find((item) => item.productId === 'P003');

      expect(p002Entry).toBeDefined();
      expect(p002Entry?.score).toBeCloseTo(1.0, 2);
      expect(p003Entry).toBeDefined();
      expect(p003Entry?.score).toBeCloseTo(0.0, 2);
    });

    it('should handle vectors with different feature counts gracefully', () => {
      const vectors: FeatureVector[] = [
        {
          productId: 'P001',
          features: [1, 0],
          presenceIndicators: [1, 1],
          normalized: true,
        },
        {
          productId: 'P002',
          features: [1, 0, 0], // Different length
          presenceIndicators: [1, 1, 1],
          normalized: true,
        },
      ];

      expect(() => calculator.computeSimilarityMatrix(vectors, 10, 0)).toThrow();
    });
  });
});
