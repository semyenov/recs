import { Product, FeatureVector, CategoryStats } from '../types';
import { logger } from '../config/logger';
import { mean, std } from 'mathjs';

export class FeatureExtractor {
  private categoryStats: Map<string, CategoryStats> | null = null;
  private featureKeys: string[] | null = null;

  setCategoryStatistics(stats: Map<string, CategoryStats>): void {
    this.categoryStats = stats;
    logger.info(`Feature extractor loaded statistics for ${stats.size} categories`);
  }

  /**
   * Discovers all numeric properties from products and establishes a consistent feature order.
   * This should be called before extractFeatures if you want to use custom properties.
   * If not called, features will be discovered from the first product processed.
   */
  discoverFeatureKeys(products: Product[]): string[] {
    const numericKeys = new Set<string>();

    for (const product of products) {
      // Check attributes structure
      if (product.attributes) {
        for (const [key, attr] of Object.entries(product.attributes)) {
          const value = attr.value;
          if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
            numericKeys.add(key);
          } else if (typeof value === 'boolean') {
            // Convert boolean to numeric feature
            numericKeys.add(key);
          } else if (typeof value === 'string') {
            // Try to parse numeric strings
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && isFinite(numValue)) {
              numericKeys.add(key);
            }
          }
        }
      }
    }

    // Sort keys for consistent ordering
    const sortedKeys = Array.from(numericKeys).sort();
    this.featureKeys = sortedKeys;

    logger.info(`Discovered ${sortedKeys.length} numeric feature keys: ${sortedKeys.join(', ')}`);
    return sortedKeys;
  }

  /**
   * Sets the feature keys explicitly. Useful when you want to control which features to extract.
   */
  setFeatureKeys(keys: string[]): void {
    this.featureKeys = [...keys].sort();
    logger.info(`Set feature keys: ${this.featureKeys.join(', ')}`);
  }

  /**
   * Gets the current feature keys, discovering them from category stats if not set.
   */
  private getFeatureKeys(stats?: CategoryStats): string[] {
    if (this.featureKeys) {
      return this.featureKeys;
    }

    // Try to discover from category stats medians
    if (stats?.medians) {
      const keys = Object.keys(stats.medians).filter(
        (key) => typeof stats.medians[key] === 'number'
      );
      if (keys.length > 0) {
        this.featureKeys = keys.sort();
        return this.featureKeys;
      }
    }

    // Fallback: return empty array (will be discovered from first product)
    return [];
  }

  extractFeatures(product: Product): FeatureVector {
    if (!this.categoryStats) {
      throw new Error('Category statistics not loaded. Call setCategoryStatistics first.');
    }

    const categoryKey = product.category || product.categoryId || product.categoryName || 'unknown';
    const stats = this.categoryStats.get(categoryKey);
    if (!stats) {
      logger.warn(`No category statistics found for category: ${categoryKey}`);
    }

    // Get feature keys, discovering from stats if needed
    let featureKeys = this.getFeatureKeys(stats);

    // If still no keys, discover from this product
    if (featureKeys.length === 0) {
      const discoveredKeys: string[] = [];

      // Check attributes
      if (product.attributes) {
        for (const [key, attr] of Object.entries(product.attributes)) {
          const value = attr.value;
          if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            (typeof value === 'string' && !isNaN(parseFloat(value)) && isFinite(parseFloat(value)))
          ) {
            discoveredKeys.push(key);
          }
        }
      }

      featureKeys = [...new Set(discoveredKeys)].sort();
      this.featureKeys = featureKeys;
      if (featureKeys.length > 0) {
        logger.info(
          `Discovered feature keys from product ${product._id}: ${featureKeys.join(', ')}`
        );
      }
    }

    // Extract numeric features with median imputation
    const features: number[] = [];
    const presenceIndicators: number[] = [];

    for (const key of featureKeys) {
      let value: number | undefined;

      // Extract from attributes
      if (product.attributes && product.attributes[key]) {
        const attrValue = product.attributes[key].value;
        if (typeof attrValue === 'number') {
          value = attrValue;
        } else if (typeof attrValue === 'boolean') {
          value = attrValue ? 1 : 0;
        } else if (typeof attrValue === 'string') {
          const numValue = parseFloat(attrValue);
          if (!isNaN(numValue) && isFinite(numValue)) {
            value = numValue;
          }
        }
      }

      if (value !== undefined) {
        features.push(value);
        presenceIndicators.push(1);
      } else {
        // Use median from category stats if available, otherwise 0
        const median = stats?.medians[key];
        features.push(typeof median === 'number' ? median : 0);
        presenceIndicators.push(0);
      }
    }

    return {
      _id: product._id,
      features,
      presenceIndicators,
      normalized: false,
    };
  }

  normalizeFeatures(vectors: FeatureVector[]): FeatureVector[] {
    if (vectors.length === 0) return [];

    const numFeatures = vectors[0].features.length;
    const featureStats: Array<{ mean: number; std: number }> = [];

    // Calculate mean and std for each feature
    for (let i = 0; i < numFeatures; i++) {
      const values = vectors.map((v) => v.features[i]);
      const meanVal = Number(mean(values));
      const stdVal = Number(std(values)) || 1; // Avoid division by zero
      featureStats.push({ mean: meanVal, std: stdVal });
    }

    // Normalize each vector
    return vectors.map((vector) => ({
      ...vector,
      features: vector.features.map((value, i) => {
        const { mean: meanVal, std: stdVal } = featureStats[i];
        return (value - meanVal) / stdVal;
      }),
      normalized: true,
    }));
  }

  batchExtractAndNormalize(products: Product[]): FeatureVector[] {
    if (products.length === 0) return [];

    // Discover feature keys from all products if not already set
    if (!this.featureKeys) {
      this.discoverFeatureKeys(products);
    }

    const vectors = products.map((p) => this.extractFeatures(p));
    return this.normalizeFeatures(vectors);
  }
}
