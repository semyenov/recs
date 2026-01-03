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
    // Features are sorted alphabetically: price, size, weight
    expect(vector.features).toEqual([150, 15, 3]);
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

    // Features are sorted alphabetically: price, size, weight
    // price=100 (median, missing), size=15 (present), weight=2 (median, missing)
    expect(vector.features).toEqual([100, 15, 2]);
    expect(vector.presenceIndicators).toEqual([0, 1, 0]);
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

  it('should extract additional numeric properties dynamically', () => {
    const extractor2 = new FeatureExtractor();

    // Set category stats with additional properties
    const categoryStats = new Map<string, CategoryStats>();
    categoryStats.set('electronics', {
      category: 'electronics',
      medians: {
        price: 100,
        size: 10,
        weight: 2,
        height: 5,
        width: 8,
      },
      counts: { total: 100 },
      lastUpdated: new Date(),
    });
    extractor2.setCategoryStatistics(categoryStats);

    const product: Product = {
      _id: '3',
      productId: 'P003',
      name: 'Test Product',
      category: 'electronics',
      technicalProperties: {
        price: 150,
        size: 15,
        weight: 3,
        height: 6,
        width: 10,
        // Add a non-numeric property that should be ignored
        color: 'red',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const vector = extractor2.extractFeatures(product);

    // Should extract all numeric properties in alphabetical order: height, price, size, weight, width
    expect(vector.features).toEqual([6, 150, 15, 3, 10]);
    expect(vector.presenceIndicators).toEqual([1, 1, 1, 1, 1]);
    expect(vector.features.length).toBe(5);
  });

  it('should handle products with different property sets', () => {
    const extractor3 = new FeatureExtractor();

    const categoryStats = new Map<string, CategoryStats>();
    categoryStats.set('electronics', {
      category: 'electronics',
      medians: { price: 100, size: 10, weight: 2 },
      counts: { total: 100 },
      lastUpdated: new Date(),
    });
    extractor3.setCategoryStatistics(categoryStats);

    const products: Product[] = [
      {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: { price: 100, size: 10, weight: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: '2',
        productId: 'P002',
        name: 'Product 2',
        category: 'electronics',
        technicalProperties: { price: 200, size: 20, volume: 100 }, // volume instead of weight
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Discover features from all products
    extractor3.discoverFeatureKeys(products);
    const vectors = extractor3.batchExtractAndNormalize(products);

    expect(vectors).toHaveLength(2);
    // Both should have the same number of features (price, size, volume, weight)
    // volume and weight will be discovered, but weight will use median for P002
    expect(vectors[0].features.length).toBe(vectors[1].features.length);
  });

  describe('discoverFeatureKeys', () => {
    it('should discover all numeric properties from products', () => {
      const extractor4 = new FeatureExtractor();
      const products: Product[] = [
        {
          _id: '1',
          productId: 'P001',
          name: 'Product 1',
          category: 'electronics',
          technicalProperties: {
            price: 100,
            size: 10,
            weight: 2,
            height: 5,
            color: 'red', // non-numeric, should be ignored
            material: 'plastic', // non-numeric, should be ignored
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: '2',
          productId: 'P002',
          name: 'Product 2',
          category: 'electronics',
          technicalProperties: {
            price: 200,
            width: 8,
            depth: 3,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const keys = extractor4.discoverFeatureKeys(products);

      // Should discover all numeric keys: depth, height, price, size, weight, width
      expect(keys).toEqual(['depth', 'height', 'price', 'size', 'weight', 'width']);
      expect(keys.length).toBe(6);
    });

    it('should return empty array for products with no numeric properties', () => {
      const extractor5 = new FeatureExtractor();
      const products: Product[] = [
        {
          _id: '1',
          productId: 'P001',
          name: 'Product 1',
          category: 'electronics',
          technicalProperties: {
            color: 'red',
            material: 'plastic',
            category: 'electronics',
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const keys = extractor5.discoverFeatureKeys(products);
      expect(keys).toEqual([]);
    });

    it('should handle empty products array', () => {
      const extractor6 = new FeatureExtractor();
      const keys = extractor6.discoverFeatureKeys([]);
      expect(keys).toEqual([]);
    });

    it('should ignore NaN and Infinity values', () => {
      const extractor7 = new FeatureExtractor();
      const products: Product[] = [
        {
          _id: '1',
          productId: 'P001',
          name: 'Product 1',
          category: 'electronics',
          technicalProperties: {
            price: 100,
            size: NaN,
            weight: Infinity,
            height: -Infinity,
            width: 10, // valid number
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const keys = extractor7.discoverFeatureKeys(products);
      // Should only include valid numeric properties
      expect(keys).toEqual(['price', 'width']);
    });
  });

  describe('setFeatureKeys', () => {
    it('should set feature keys explicitly', () => {
      const extractor8 = new FeatureExtractor();
      extractor8.setFeatureKeys(['price', 'size', 'weight']);

      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100, size: 10, weight: 2, height: 5 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor8.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: {
          price: 150,
          size: 15,
          weight: 3,
          height: 6, // should be ignored since not in feature keys
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const vector = extractor8.extractFeatures(product);
      // Should only extract the specified keys
      expect(vector.features).toEqual([150, 15, 3]);
      expect(vector.features.length).toBe(3);
    });

    it('should sort feature keys alphabetically', () => {
      const extractor9 = new FeatureExtractor();
      extractor9.setFeatureKeys(['weight', 'price', 'size']); // unsorted order

      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100, size: 10, weight: 2 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor9.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: { price: 150, size: 15, weight: 3 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const vector = extractor9.extractFeatures(product);
      // Should be sorted: price, size, weight
      expect(vector.features).toEqual([150, 15, 3]);
    });
  });

  describe('error handling', () => {
    it('should throw error when extracting features without category statistics', () => {
      const extractor10 = new FeatureExtractor();
      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: { price: 100 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => extractor10.extractFeatures(product)).toThrow(
        'Category statistics not loaded. Call setCategoryStatistics first.'
      );
    });

    it('should handle products with category not in statistics', () => {
      const extractor11 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor11.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'clothing', // category not in stats
        technicalProperties: { price: 150 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Should not throw, but use 0 for missing medians
      const vector = extractor11.extractFeatures(product);
      expect(vector.features).toEqual([150]);
    });
  });

  describe('normalization edge cases', () => {
    it('should handle single vector normalization', () => {
      const extractor12 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100, size: 10 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor12.setCategoryStatistics(categoryStats);

      const products: Product[] = [
        {
          _id: '1',
          productId: 'P001',
          name: 'Product 1',
          category: 'electronics',
          technicalProperties: { price: 100, size: 10 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const vectors = extractor12.batchExtractAndNormalize(products);
      expect(vectors).toHaveLength(1);
      expect(vectors[0].normalized).toBe(true);
      // Single value normalized should be close to 0 (mean of itself)
      expect(Math.abs(vectors[0].features[0])).toBeLessThan(0.01);
    });

    it('should handle zero variance features', () => {
      const extractor13 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor13.setCategoryStatistics(categoryStats);

      const products: Product[] = [
        {
          _id: '1',
          productId: 'P001',
          name: 'Product 1',
          category: 'electronics',
          technicalProperties: { price: 100 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: '2',
          productId: 'P002',
          name: 'Product 2',
          category: 'electronics',
          technicalProperties: { price: 100 }, // same value
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const vectors = extractor13.batchExtractAndNormalize(products);
      expect(vectors).toHaveLength(2);
      // Should handle zero variance (std = 0, uses 1 as fallback)
      expect(vectors[0].normalized).toBe(true);
      expect(vectors[1].normalized).toBe(true);
    });

    it('should return empty array for empty products', () => {
      const extractor14 = new FeatureExtractor();
      const vectors = extractor14.batchExtractAndNormalize([]);
      expect(vectors).toEqual([]);
    });
  });

  describe('feature discovery from category stats', () => {
    it('should discover feature keys from category statistics medians', () => {
      const extractor15 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: {
          price: 100,
          size: 10,
          weight: 2,
          height: 5,
        },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor15.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: {
          price: 150,
          // size, weight, height missing - should use medians
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const vector = extractor15.extractFeatures(product);
      // Should discover keys from category stats: height, price, size, weight
      expect(vector.features.length).toBe(4);
      expect(vector.features[0]).toBe(5); // height median
      expect(vector.features[1]).toBe(150); // price present
      expect(vector.features[2]).toBe(10); // size median
      expect(vector.features[3]).toBe(2); // weight median
    });
  });

  describe('presence indicators', () => {
    it('should correctly mark presence indicators for all features', () => {
      const extractor16 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100, size: 10, weight: 2 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor16.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: {
          price: 150,
          // size and weight missing
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const vector = extractor16.extractFeatures(product);
      // price present (1), size missing (0), weight missing (0)
      expect(vector.presenceIndicators).toEqual([1, 0, 0]);
      expect(vector.presenceIndicators.length).toBe(vector.features.length);
    });
  });

  describe('products with undefined and null values', () => {
    it('should handle undefined values in technical properties', () => {
      const extractor17 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100, size: 10 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor17.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: {
          price: 150,
          size: undefined as unknown as number,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const vector = extractor17.extractFeatures(product);
      expect(vector.features).toEqual([150, 10]); // size uses median
      expect(vector.presenceIndicators).toEqual([1, 0]);
    });

    it('should handle null values in technical properties', () => {
      const extractor18 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor18.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: {
          price: null as unknown as number,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const vector = extractor18.extractFeatures(product);
      expect(vector.features).toEqual([100]); // uses median
      expect(vector.presenceIndicators).toEqual([0]);
    });
  });

  describe('consistency and ordering', () => {
    it('should maintain consistent feature order across multiple products', () => {
      const extractor19 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100, size: 10, weight: 2, height: 5 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor19.setCategoryStatistics(categoryStats);

      const products: Product[] = [
        {
          _id: '1',
          productId: 'P001',
          name: 'Product 1',
          category: 'electronics',
          technicalProperties: { price: 150, size: 15 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: '2',
          productId: 'P002',
          name: 'Product 2',
          category: 'electronics',
          technicalProperties: { weight: 3, height: 6 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const vectors = extractor19.batchExtractAndNormalize(products);
      expect(vectors).toHaveLength(2);
      // Both should have the same number of features in the same order
      expect(vectors[0].features.length).toBe(vectors[1].features.length);
      expect(vectors[0].features.length).toBe(4); // height, price, size, weight
    });

    it('should handle products with zero values', () => {
      const extractor20 = new FeatureExtractor();
      const categoryStats = new Map<string, CategoryStats>();
      categoryStats.set('electronics', {
        category: 'electronics',
        medians: { price: 100, size: 10 },
        counts: { total: 100 },
        lastUpdated: new Date(),
      });
      extractor20.setCategoryStatistics(categoryStats);

      const product: Product = {
        _id: '1',
        productId: 'P001',
        name: 'Product 1',
        category: 'electronics',
        technicalProperties: {
          price: 0, // zero is a valid number
          size: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const vector = extractor20.extractFeatures(product);
      expect(vector.features).toEqual([0, 0]);
      expect(vector.presenceIndicators).toEqual([1, 1]); // zero is still present
    });
  });
});
