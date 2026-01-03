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
});
