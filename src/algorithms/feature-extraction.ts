import { Product, FeatureVector, CategoryStats } from '../types';
import { logger } from '../config/logger';
import { mean, std } from 'mathjs';

export class FeatureExtractor {
  private categoryStats: Map<string, CategoryStats> | null = null;

  setCategoryStatistics(stats: Map<string, CategoryStats>): void {
    this.categoryStats = stats;
    logger.info(`Feature extractor loaded statistics for ${stats.size} categories`);
  }

  extractFeatures(product: Product): FeatureVector {
    if (!this.categoryStats) {
      throw new Error('Category statistics not loaded. Call setCategoryStatistics first.');
    }

    const stats = this.categoryStats.get(product.category);
    if (!stats) {
      logger.warn(`No category statistics found for category: ${product.category}`);
    }

    const props = product.technicalProperties;

    // Extract numeric features with median imputation
    const features: number[] = [];
    const presenceIndicators: number[] = [];

    // Size
    if (props.size !== undefined && typeof props.size === 'number') {
      features.push(props.size);
      presenceIndicators.push(1);
    } else {
      features.push(stats?.medians.size ?? 0);
      presenceIndicators.push(0);
    }

    // Price
    if (props.price !== undefined && typeof props.price === 'number') {
      features.push(props.price);
      presenceIndicators.push(1);
    } else {
      features.push(stats?.medians.price ?? 0);
      presenceIndicators.push(0);
    }

    // Weight
    if (props.weight !== undefined && typeof props.weight === 'number') {
      features.push(props.weight);
      presenceIndicators.push(1);
    } else {
      features.push(stats?.medians.weight ?? 0);
      presenceIndicators.push(0);
    }

    return {
      productId: product.productId,
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
    const vectors = products.map((p) => this.extractFeatures(p));
    return this.normalizeFeatures(vectors);
  }
}
