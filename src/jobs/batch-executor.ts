import { Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  ProductRepository,
  OrderRepository,
  RecommendationRepository,
} from '../storage/repositories';
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
  private collaborativeFilter = new CollaborativeFilter();
  private associationRuleMiner = new AssociationRuleMiner();
  // private recommendationEngine = new RecommendationEngine(); // TODO: Use for hybrid blending

  async executeCollaborativeJob(_job: Job): Promise<void> {
    const batchId = uuidv4();
    const version = `v${Date.now()}`;
    const startTime = Date.now();

    logger.info('Starting collaborative filtering batch job', { batchId, version });

    try {
      // Step 1: Load all orders
      logger.info('Loading all orders', { batchId, version });
      const orders = await this.orderRepo.findAll();
      logger.info(`Loaded ${orders.length} orders`, { batchId });

      // Step 2: Compute item-based similarity
      logger.info('Computing item-based similarity', {
        batchId,
        version,
        orderCount: orders.length,
        minOrdersPerProduct: config.MIN_ORDERS_PER_PRODUCT,
      });
      const similarityMatrix = this.collaborativeFilter.computeItemBasedSimilarity(
        orders,
        config.MIN_ORDERS_PER_PRODUCT
      );
      logger.info(`Computed similarity matrix for ${similarityMatrix.size} products`, { batchId });

      // Step 3: Save recommendations
      logger.info('Building recommendations array', { batchId, version });
      const recommendations: Recommendation[] = [];
      for (const [productId, similar] of similarityMatrix) {
        const topN = similar.slice(0, config.PRE_COMPUTE_TOP_N);
        recommendations.push({
          productId,
          algorithmType: 'collaborative',
          recommendations: topN.map((s) => ({
            productId: s.productId,     
            score: s.score,
            breakdown: {
              collaborative: s.score,
              blendedScore: s.score,
              weights: { collaborative: 1, association: 0 },
            },
          })),
          version,
          batchId,
          createdAt: new Date(),
        });
      }
      logger.info(`Built ${recommendations.length} recommendations`, { batchId });

      logger.info('Saving recommendations to repository', {
        batchId,
        version,
        count: recommendations.length,
      });
      await this.recommendationRepo.bulkUpsert(recommendations);
      logger.info('Recommendations saved successfully', { batchId });

      // Step 4: Quality validation and promotion
      // Quality checks ensure recommendations meet minimum standards before promotion:
      // - Average score: Ensures recommendations have meaningful similarity scores
      // - Coverage: Ensures a sufficient percentage of products have recommendations
      // - Diversity: Ensures recommendations cover a diverse set of products
      logger.info('Validating recommendation quality', { batchId, version });
      const metrics = await this.validateQuality(recommendations);
      logger.info('Quality metrics calculated', { batchId, version, metrics });

      // Quality gates act as a safety check to prevent promoting low-quality recommendations
      // If gates fail, the version is deleted and not promoted to production
      logger.info('Checking quality gates', { batchId, version, metrics });
      if (await this.qualityGatesPassed(metrics, 'collaborative')) {
        logger.info('Quality gates passed, promoting version', { batchId, version });
        await this.promoteVersion(version, metrics);
        logger.info('✅ Collaborative filtering batch job completed', {
          batchId,
          version,
          duration: Date.now() - startTime,
        });
      } else {
        logger.error('❌ Quality gates failed', { version, metrics });
        logger.info('Deleting failed version recommendations', { batchId, version });
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
      // Step 1: Load orders and compute co-occurrences and product frequencies
      logger.info('Loading product co-occurrences', { batchId, version });
      const coOccurrences = await this.orderRepo.getProductCoOccurrences();
      logger.info(`Loaded co-occurrences for ${coOccurrences.size} product pairs`, { batchId });

      logger.info('Loading product frequencies', { batchId, version });
      const productFrequencies = await this.orderRepo.getProductFrequencies();
      logger.info(`Loaded frequencies for ${productFrequencies.size} products`, { batchId });

      const totalOrders = (await this.orderRepo.findAll()).length;
      logger.info(`Total orders: ${totalOrders}`, { batchId });

      // Step 2: Mine association rules
      logger.info('Mining association rules', {
        batchId,
        version,
        totalOrders,
        minSupport: config.MIN_SUPPORT_THRESHOLD,
        confidenceThreshold: config.CONFIDENCE_THRESHOLD,
      });
      const rules = this.associationRuleMiner.mineRules(
        coOccurrences,
        productFrequencies,
        totalOrders,
        config.MIN_SUPPORT_THRESHOLD,
        config.CONFIDENCE_THRESHOLD
      );
      const totalRules = Array.from(rules.values()).reduce((sum, r) => sum + r.length, 0);
      logger.info(`Mined ${totalRules} association rules for ${rules.size} products`, { batchId });

      // Step 3: Save recommendations
      logger.info('Building recommendations array', { batchId, version });
      const recommendations: Recommendation[] = [];
      for (const [productId, productRules] of rules) {
        const topN = productRules.slice(0, config.PRE_COMPUTE_TOP_N);
        // Skip products with no rules (empty recommendations array)
        if (topN.length === 0) {
          continue;
        }
        recommendations.push({
          productId,
          algorithmType: 'association',
          recommendations: topN.map((rule) => ({
            productId: rule.consequent,
            score: rule.confidence,
            breakdown: {
              association: rule.confidence,
              blendedScore: rule.confidence,
              weights: { collaborative: 0, association: 1 },
            },
          })),
          version,
          batchId,
          createdAt: new Date(),
        });
      }
      logger.info(`Built ${recommendations.length} recommendations`, { batchId });

      logger.info('Saving recommendations to repository', {
        batchId,
        version,
        count: recommendations.length,
      });
      await this.recommendationRepo.bulkUpsert(recommendations);
      logger.info('Recommendations saved successfully', { batchId });

      // Step 4: Quality validation and promotion
      // Quality checks ensure recommendations meet minimum standards before promotion:
      // - Average score: Ensures recommendations have meaningful similarity scores
      // - Coverage: Ensures a sufficient percentage of products have recommendations
      // - Diversity: Ensures recommendations cover a diverse set of products
      logger.info('Validating recommendation quality', { batchId, version });
      const metrics = await this.validateQuality(recommendations);
      logger.info('Quality metrics calculated', { batchId, version, metrics });

      // Quality gates act as a safety check to prevent promoting low-quality recommendations
      // If gates fail, the version is deleted and not promoted to production
      logger.info('Checking quality gates', { batchId, version, metrics });
      if (await this.qualityGatesPassed(metrics, 'association')) {
        logger.info('Quality gates passed, promoting version', { batchId, version });
        await this.promoteVersion(version, metrics);
        logger.info('✅ Association rules batch job completed', {
          batchId,
          version,
          duration: Date.now() - startTime,
        });
      } else {
        logger.error('❌ Quality gates failed', { version, metrics });
        logger.info('Deleting failed version recommendations', { batchId, version });
        await this.recommendationRepo.deleteByVersion(version);
      }
    } catch (error) {
      logger.error('❌ Association rules batch job failed', { batchId, error });
      throw error;
    }
  }

  /**
   * Validates the quality of recommendations by calculating three key metrics:
   *
   * 1. Average Score: The mean recommendation score across all recommendations.
   *    Higher scores indicate stronger similarity/confidence in recommendations.
   *
   * 2. Coverage: The percentage of products that have recommendations.
   *    Ensures the recommendation system covers a sufficient portion of the catalog.
   *
   * 3. Diversity Score: The ratio of unique recommended products to total recommendations.
   *    Higher diversity means recommendations are spread across more products rather than
   *    being concentrated on a few popular items.
   */
  private async validateQuality(recommendations: Recommendation[]): Promise<QualityMetrics> {
    logger.info('Starting quality validation', { recommendationCount: recommendations.length });

    if (recommendations.length === 0) {
      logger.warn('No recommendations to validate, returning zero metrics');
      return {
        avgScore: 0,
        coverage: 0,
        diversityScore: 0,
      };
    }

    // Calculate average score
    // This metric indicates the overall confidence/quality of recommendations
    logger.info('Calculating average recommendation score');
    let totalScore = 0;
    let totalRecs = 0;
    for (const rec of recommendations) {
      for (const r of rec.recommendations) {
        totalScore += r.score;
        totalRecs++;
      }
    }
    const avgScore = totalRecs > 0 ? totalScore / totalRecs : 0;
    logger.info('Average score calculated', { avgScore, totalRecommendations: totalRecs });

    // Calculate coverage (% of products with recommendations)
    // Coverage ensures we're providing recommendations for a meaningful portion of the catalog
    logger.info('Calculating coverage percentage');
    const totalProducts = (await this.productRepo.findAll()).length;
    const coverage = recommendations.length / totalProducts;
    logger.info('Coverage calculated', {
      coverage,
      productsWithRecs: recommendations.length,
      totalProducts,
    });

    // Calculate diversity score (simplified: unique products recommended / total recommendations)
    // Diversity prevents the system from only recommending the same popular products
    logger.info('Calculating diversity score');
    const uniqueProducts = new Set<string>();
    for (const rec of recommendations) {
      for (const r of rec.recommendations) {
        uniqueProducts.add(r.productId);
      }
    }
    const diversityScore = totalRecs > 0 ? uniqueProducts.size / totalRecs : 0;
    logger.info('Diversity score calculated', {
      diversityScore,
      uniqueProducts: uniqueProducts.size,
      totalRecs,
    });

    const metrics = {
      avgScore,
      coverage,
      diversityScore,
    };
    logger.info('Quality validation completed', { metrics });
    return metrics;
  }

  /**
   * Quality gates ensure recommendations meet minimum quality standards before promotion.
   *
   * Algorithm-specific thresholds (configurable via environment variables):
   * - collaborative:
   *   - avgScore >= QUALITY_COLLABORATIVE_AVG_SCORE_THRESHOLD
   *   - coverage >= QUALITY_COLLABORATIVE_COVERAGE_THRESHOLD
   *   - diversityScore >= QUALITY_COLLABORATIVE_DIVERSITY_THRESHOLD
   * - association:
   *   - avgScore >= QUALITY_ASSOCIATION_AVG_SCORE_THRESHOLD
   *   - coverage >= QUALITY_ASSOCIATION_COVERAGE_THRESHOLD
   *   - diversityScore >= QUALITY_ASSOCIATION_DIVERSITY_THRESHOLD
   *
   * All thresholds must pass for the version to be promoted. If any threshold fails,
   * the recommendations are considered too low quality for production use.
   */
  private async qualityGatesPassed(
    metrics: QualityMetrics,
    algorithmType: 'collaborative' | 'association' = 'collaborative'
  ): Promise<boolean> {
    // Algorithm-specific thresholds from config
    const thresholds =
      algorithmType === 'association'
        ? {
            avgScore: config.QUALITY_ASSOCIATION_AVG_SCORE_THRESHOLD,
            coverage: config.QUALITY_ASSOCIATION_COVERAGE_THRESHOLD,
            diversityScore: config.QUALITY_ASSOCIATION_DIVERSITY_THRESHOLD,
          }
        : {
            avgScore: config.QUALITY_COLLABORATIVE_AVG_SCORE_THRESHOLD,
            coverage: config.QUALITY_COLLABORATIVE_COVERAGE_THRESHOLD,
            diversityScore: config.QUALITY_COLLABORATIVE_DIVERSITY_THRESHOLD,
          };

    logger.info('Evaluating quality gates', { metrics, thresholds, algorithmType });

    const avgScorePassed = metrics.avgScore >= thresholds.avgScore;
    const coveragePassed = metrics.coverage >= thresholds.coverage;
    const diversityPassed = metrics.diversityScore >= thresholds.diversityScore;

    logger.info('Quality gate results', {
      avgScore: {
        passed: avgScorePassed,
        value: metrics.avgScore,
        threshold: thresholds.avgScore,
      },
      coverage: {
        passed: coveragePassed,
        value: metrics.coverage,
        threshold: thresholds.coverage,
      },
      diversity: {
        passed: diversityPassed,
        value: metrics.diversityScore,
        threshold: thresholds.diversityScore,
      },
    });

    const allPassed = avgScorePassed && coveragePassed && diversityPassed;
    logger.info(allPassed ? 'All quality gates passed' : 'One or more quality gates failed', {
      allPassed,
    });

    return Promise.resolve(allPassed);
  }

  private async promoteVersion(version: string, metrics: QualityMetrics): Promise<void> {
    logger.info('Starting version promotion', { version, metrics });

    // Get current and previous versions
    logger.info('Retrieving version history', { version });
    const currentVersion = await redisClient.get<string>('rec:current_version');
    const previousVersion = await redisClient.get<string>('rec:previous_version');
    logger.info('Version history retrieved', { currentVersion, previousVersion });

    // Shift version history
    // Maintains a rolling history: current -> previous -> archived
    logger.info('Shifting version history', { version });
    if (previousVersion) {
      await redisClient.set('rec:archived_version', previousVersion);
      logger.info('Archived previous version', { archivedVersion: previousVersion });
    }
    if (currentVersion) {
      await redisClient.set('rec:previous_version', currentVersion);
      logger.info('Moved current to previous version', { previousVersion: currentVersion });
    }

    // Promote new version
    logger.info('Promoting new version to current', { version });
    await redisClient.set('rec:current_version', version);

    // Store version metadata
    logger.info('Storing version metadata', { version });
    const versionMetadata: RecommendationVersion = {
      version,
      timestamp: Date.now(),
      status: 'active',
      metrics,
    };
    await redisClient.set(`rec:version:${version}`, versionMetadata);

    // Warm cache for hot products (top 100)
    logger.info('Starting cache warm-up', { version });
    await this.warmCache(version);

    logger.info('✅ Version promoted successfully', { version, metrics });
  }

  private async warmCache(version: string): Promise<void> {
    // Get hot products (simplified: just take first 100)
    // In production, this would use actual popularity metrics
    logger.info('Loading hot products for cache warming', { version, limit: 100 });
    const products = await this.productRepo.findAll(100);
    logger.info(`Loaded ${products.length} products for cache warming`, { version });

    let cachedCount = 0;
    for (const product of products) {
      const recs = await this.recommendationRepo.findByProductId(product._id, version);
      if (recs) {
        await redisClient.set(`recs:${product._id}:${version}`, recs, 14400); // 4h TTL
        cachedCount++;
      }
    }

    logger.info(`Cache warmed with ${cachedCount} products`, {
      version,
      totalProducts: products.length,
    });
  }
}
