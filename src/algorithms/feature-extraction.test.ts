import '../test/test-env'; // Load test environment first
import { FeatureExtractor } from '../algorithms/feature-extraction';
import { Product, CategoryStats } from '../types';

describe('FeatureExtractor', () => {
  let extractor: FeatureExtractor;

  beforeEach(() => {
    extractor = new FeatureExtractor();

    // Mock category statistics
    const categoryStats = new Map<string, CategoryStats>();
    categoryStats.set('electronics', {
      category: 'electronics',
      medians: { size: 10, price: 100, weight: 2 },
      counts: { total: 100, withSize: 90, withPrice: 95, withWeight: 85 },
      lastUpdated: new Date(),
    });

    extractor.setCategoryStatistics(categoryStats);
  });

  it('should extract features with all properties present', () => {
    const product: Product = {
      _id: '1',
      productId: 'P001',
      name: 'Test Product',
      category: 'electronics',
      technicalProperties: {
        size: 15,
        price: 150,
        weight: 3,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const vector = extractor.extractFeatures(product);

    expect(vector.productId).toBe('P001');
    expect(vector.features).toEqual([15, 150, 3]);
    expect(vector.presenceIndicators).toEqual([1, 1, 1]);
    expect(vector.normalized).toBe(false);
  });

  it('should impute missing features with median', () => {
    const product: Product = {
      _id: '2',
      productId: 'P002',
      name: 'Test Product',
      category: 'electronics',
      technicalProperties: {
        size: 15,
        // price and weight missing
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const vector = extractor.extractFeatures(product);

    expect(vector.features).toEqual([15, 100, 2]); // price=100, weight=2 (medians)
    expect(vector.presenceIndicators).toEqual([1, 0, 0]);
  });

  it('should normalize feature vectors', () => {
    const products: Product[] = [
      {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: { size: 10, price: 100, weight: 1 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: '2',
        productId: 'P002',
        name: 'Product 2',
        category: 'electronics',
        technicalProperties: { size: 20, price: 200, weight: 3 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const vectors = extractor.batchExtractAndNormalize(products);

    expect(vectors).toHaveLength(2);
    expect(vectors[0].normalized).toBe(true);
    expect(vectors[1].normalized).toBe(true);

    // Mean should be close to 0, std close to 1
    const feature0Values = vectors.map((v) => v.features[0]);
    const mean0 = feature0Values.reduce((a, b) => a + b, 0) / feature0Values.length;
    expect(Math.abs(mean0)).toBeLessThan(0.01);
  });
});
