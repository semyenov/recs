import { Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  ProductRepository,
  OrderRepository,
  RecommendationRepository,
} from '../storage/repositories';
import { FeatureExtractor } from '../algorithms/feature-extraction';
import { SimilarityCalculator } from '../algorithms/similarity';
import { CollaborativeFilter } from '../algorithms/collaborative-filtering';
import { AssociationRuleMiner } from '../algorithms/association-rules';
import { redisClient } from '../storage/redis';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { Recommendation, RecommendationVersion, QualityMetrics } from '../types';

export class BatchExecutor {
  private productRepo = new ProductRepository();
  private orderRepo = new OrderRepository();
  private recommendationRepo = new RecommendationRepository();
  private featureExtractor = new FeatureExtractor();
  private similarityCalculator = new SimilarityCalculator();
  private collaborativeFilter = new CollaborativeFilter();
  private associationRuleMiner = new AssociationRuleMiner();
  // private recommendationEngine = new RecommendationEngine(); // TODO: Use for hybrid blending

  async executeContentBasedJob(_job: Job): Promise<void> {
    const batchId = uuidv4();
    const version = `v${Date.now()}`;
    const startTime = Date.now();

    logger.info('Starting content-based batch job', { batchId, version });

    try {
      // Step 1: Load category statistics
      const categoryStats = await this.productRepo.getCategoryStatistics();
      await redisClient.set('category_stats', Array.from(categoryStats.entries()), 86400); // 24h cache
      this.featureExtractor.setCategoryStatistics(categoryStats);

      // Step 2: Load all products
      const products = await this.productRepo.findAll();
      logger.info(`Loaded ${products.length} products`);

      // Step 3: Extract and normalize features
      const featureVectors = this.featureExtractor.batchExtractAndNormalize(products);

      // Step 4: Compute similarity matrix
      const similarityMatrix = this.similarityCalculator.computeSimilarityMatrix(
        featureVectors,
        config.PRE_COMPUTE_TOP_N,
        config.MIN_SCORE_THRESHOLD
      );

      // Step 5: Save recommendations
      const recommendations: Recommendation[] = [];
      for (const [productId, similar] of similarityMatrix) {
        recommendations.push({
          productId,
          algorithmType: 'content-based',
          recommendations: similar.map((s: { _id: string; score: number }) => ({
            _id: s._id,
            score: s.score,
            breakdown: {
              contentBased: s.score,
              blendedScore: s.score,
              weights: { contentBased: 1, collaborative: 0, association: 0 },
            },
          })),
          version,
          batchId,
          createdAt: new Date(),
        });
      }

      await this.recommendationRepo.bulkUpsert(recommendations);

      // Step 6: Quality validation
      const metrics = await this.validateQuality(recommendations);

      // Step 7: Promote if quality gates pass
      if (await this.qualityGatesPassed(metrics)) {
        await this.promoteVersion(version, metrics);
        logger.info('✅ Content-based batch job completed successfully', {
          batchId,
          version,
          duration: Date.now() - startTime,
          productsProcessed: products.length,
        });
      } else {
        logger.error('❌ Quality gates failed, version not promoted', { version, metrics });
        await this.recommendationRepo.deleteByVersion(version);
      }
    } catch (error) {
      logger.error('❌ Content-based batch job failed', { batchId, error });
      throw error;
    }
  }

  async executeCollaborativeJob(_job: Job): Promise<void> {
    const batchId = uuidv4();
    const version = `v${Date.now()}`;
    const startTime = Date.now();

    logger.info('Starting collaborative filtering batch job', { batchId, version });

    try {
      // Step 1: Load all orders
      const orders = await this.orderRepo.findAll();
      logger.info(`Loaded ${orders.length} orders`);

      // Step 2: Compute item-based similarity
      const similarityMatrix = this.collaborativeFilter.computeItemBasedSimilarity(
        orders,
        config.MIN_ORDERS_PER_PRODUCT
      );

      // Step 3: Save recommendations
      const recommendations: Recommendation[] = [];
      for (const [productId, similar] of similarityMatrix) {
        const topN = similar.slice(0, config.PRE_COMPUTE_TOP_N);
        recommendations.push({
          productId,
          algorithmType: 'collaborative',
          recommendations: topN.map((s) => ({
            _id: s._id,
            score: s.score,
            breakdown: {
              collaborative: s.score,
              blendedScore: s.score,
              weights: { contentBased: 0, collaborative: 1, association: 0 },
            },
          })),
          version,
          batchId,
          createdAt: new Date(),
        });
      }

      await this.recommendationRepo.bulkUpsert(recommendations);

      // Step 4: Quality validation and promotion
      const metrics = await this.validateQuality(recommendations);
      if (await this.qualityGatesPassed(metrics)) {
        await this.promoteVersion(version, metrics);
        logger.info('✅ Collaborative filtering batch job completed', {
          batchId,
          version,
          duration: Date.now() - startTime,
        });
      } else {
        logger.error('❌ Quality gates failed', { version, metrics });
        await this.recommendationRepo.deleteByVersion(version);
      }
    } catch (error) {
      logger.error('❌ Collaborative filtering batch job failed', { batchId, error });
      throw error;
    }
  }

  async executeAssociationRulesJob(_job: Job): Promise<void> {
    const batchId = uuidv4();
    const version = `v${Date.now()}`;
    const startTime = Date.now();

    logger.info('Starting association rules batch job', { batchId, version });

    try {
      // Step 1: Load orders and compute co-occurrences
      const coOccurrences = await this.orderRepo.getProductCoOccurrences();
      const totalOrders = (await this.orderRepo.findAll()).length;

      // Step 2: Mine association rules
      const rules = this.associationRuleMiner.mineRules(
        coOccurrences,
        totalOrders,
        0.01, // min support
        config.CONFIDENCE_THRESHOLD
      );

      // Step 3: Save recommendations
      const recommendations: Recommendation[] = [];
      for (const [productId, productRules] of rules) {
        const topN = productRules.slice(0, config.PRE_COMPUTE_TOP_N);
        recommendations.push({
          productId,
          algorithmType: 'association',
          recommendations: topN.map((rule) => ({
            _id: rule.consequent,
            score: rule.confidence,
            breakdown: {
              association: rule.confidence,
              blendedScore: rule.confidence,
              weights: { contentBased: 0, collaborative: 0, association: 1 },
            },
          })),
          version,
          batchId,
          createdAt: new Date(),
        });
      }

      await this.recommendationRepo.bulkUpsert(recommendations);

      // Step 4: Quality validation and promotion
      const metrics = await this.validateQuality(recommendations);
      if (await this.qualityGatesPassed(metrics)) {
        await this.promoteVersion(version, metrics);
        logger.info('✅ Association rules batch job completed', {
          batchId,
          version,
          duration: Date.now() - startTime,
        });
      } else {
        logger.error('❌ Quality gates failed', { version, metrics });
        await this.recommendationRepo.deleteByVersion(version);
      }
    } catch (error) {
      logger.error('❌ Association rules batch job failed', { batchId, error });
      throw error;
    }
  }

  private async validateQuality(recommendations: Recommendation[]): Promise<QualityMetrics> {
    if (recommendations.length === 0) {
      return {
        avgScore: 0,
        coverage: 0,
        diversityScore: 0,
      };
    }

    // Calculate average score
    let totalScore = 0;
    let totalRecs = 0;
    for (const rec of recommendations) {
      for (const r of rec.recommendations) {
        totalScore += r.score;
        totalRecs++;
      }
    }
    const avgScore = totalRecs > 0 ? totalScore / totalRecs : 0;

    // Calculate coverage (% of products with recommendations)
    const totalProducts = (await this.productRepo.findAll()).length;
    const coverage = recommendations.length / totalProducts;

    // Calculate diversity score (simplified: unique products recommended / total recommendations)
    const uniqueProducts = new Set<string>();
    for (const rec of recommendations) {
      for (const r of rec.recommendations) {
        uniqueProducts.add(r._id);
      }
    }
    const diversityScore = uniqueProducts.size / totalRecs;

    return {
      avgScore,
      coverage,
      diversityScore,
    };
  }

  private async qualityGatesPassed(metrics: QualityMetrics): Promise<boolean> {
    const thresholds = {
      avgScore: 0.4,
      coverage: 0.7,
      diversityScore: 0.6,
    };

    return Promise.resolve(
      metrics.avgScore >= thresholds.avgScore &&
        metrics.coverage >= thresholds.coverage &&
        metrics.diversityScore >= thresholds.diversityScore
    );
  }

  private async promoteVersion(version: string, metrics: QualityMetrics): Promise<void> {
    // Get current and previous versions
    const currentVersion = await redisClient.get<string>('rec:current_version');
    const previousVersion = await redisClient.get<string>('rec:previous_version');

    // Shift version history
    if (previousVersion) {
      await redisClient.set('rec:archived_version', previousVersion);
    }
    if (currentVersion) {
      await redisClient.set('rec:previous_version', currentVersion);
    }

    // Promote new version
    await redisClient.set('rec:current_version', version);

    // Store version metadata
    const versionMetadata: RecommendationVersion = {
      version,
      timestamp: Date.now(),
      status: 'active',
      metrics,
    };
    await redisClient.set(`rec:version:${version}`, versionMetadata);

    // Warm cache for hot products (top 100)
    await this.warmCache(version);

    logger.info('✅ Version promoted successfully', { version, metrics });
  }

  private async warmCache(version: string): Promise<void> {
    // Get hot products (simplified: just take first 100)
    const products = await this.productRepo.findAll(100);

    for (const product of products) {
      const recs = await this.recommendationRepo.findByProductId(product._id, version);
      if (recs) {
        await redisClient.set(`recs:${product._id}:${version}`, recs, 14400); // 4h TTL
      }
    }

    logger.info(`Cache warmed with ${products.length} products`);
  }
}
