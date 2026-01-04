import { Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  ProductRepository,
  OrderRepository,
  RecommendationRepository,
} from '../storage/repositories';
import { CollaborativeFilter } from '../algorithms/collaborative-filtering';
import { AssociationRuleMiner } from '../algorithms/association-rules';
import { RecommendationEngine } from '../engine/recommendation-engine';
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
  private recommendationEngine = new RecommendationEngine();

  /**
   * Gets or creates a shared version for batch jobs.
   * 
   * This ensures both collaborative and association jobs use the same version,
   * enabling hybrid recommendation generation to work correctly.
   * 
   * The version is stored in Redis with a 1-hour TTL to prevent stale versions
   * from being reused if jobs fail or are abandoned.
   * 
   * @returns Version string (e.g., "v1234567890")
   */
  private async getOrCreateSharedVersion(): Promise<string> {
    const VERSION_KEY = 'rec:batch_version';
    const VERSION_TTL = 3600; // 1 hour

    try {
      // Try to get existing version from Redis
      const existingVersion = await redisClient.get<string>(VERSION_KEY);
      
      if (existingVersion) {
        logger.info('Using existing shared version from Redis', { version: existingVersion });
        return existingVersion;
      }

      // No existing version, create a new one
      const newVersion = `v${Date.now()}`;
      
      try {
        // Store in Redis with TTL
        await redisClient.set(VERSION_KEY, newVersion, VERSION_TTL);
        logger.info('Created new shared version and stored in Redis', {
          version: newVersion,
          ttl: VERSION_TTL,
        });
      } catch (redisError) {
        // If Redis set fails, log warning but continue with local version
        logger.warn('Failed to store version in Redis, using local version', {
          version: newVersion,
          error: redisError,
        });
      }

      return newVersion;
    } catch (error) {
      // If Redis get fails, create new version locally
      const fallbackVersion = `v${Date.now()}`;
      logger.warn('Failed to get version from Redis, using fallback version', {
        version: fallbackVersion,
        error,
      });
      return fallbackVersion;
    }
  }

  async executeCollaborativeJob(_job: Job): Promise<void> {
    const batchId = uuidv4();
    const version = await this.getOrCreateSharedVersion();
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
        minCommonUsers: config.MIN_COMMON_USERS,
      });
      const similarityMatrix = await this.collaborativeFilter.computeItemBasedSimilarity(orders);
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
      // Calculate quality metrics for monitoring and logging:
      // - Average score: Mean recommendation score across all recommendations
      // - Coverage: Percentage of products that have recommendations
      // - Diversity: Ratio of unique recommended products to total recommendations
      logger.info('Validating recommendation quality', { batchId, version });
      const metrics = await this.validateQuality(recommendations);
      logger.info('Quality metrics calculated', { batchId, version, metrics });

      // Promote version with calculated metrics
      logger.info('Promoting version', { batchId, version });
      await this.promoteVersion(version, metrics);
      logger.info('✅ Collaborative filtering batch job completed', {
        batchId,
        version,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      logger.error('❌ Collaborative filtering batch job failed', { batchId, error });
      throw error;
    }
  }

  async executeAssociationRulesJob(_job: Job): Promise<void> {
    const batchId = uuidv4();
    const version = await this.getOrCreateSharedVersion();
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

      const totalOrders = await this.orderRepo.size();
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
      // Calculate quality metrics for monitoring and logging:
      // - Average score: Mean recommendation score across all recommendations
      // - Coverage: Percentage of products that have recommendations
      // - Diversity: Ratio of unique recommended products to total recommendations
      logger.info('Validating recommendation quality', { batchId, version });
      const metrics = await this.validateQuality(recommendations);
      logger.info('Quality metrics calculated', { batchId, version, metrics });

      // Promote version with calculated metrics
      logger.info('Promoting version', { batchId, version });
      await this.promoteVersion(version, metrics);
      logger.info('✅ Association rules batch job completed', {
        batchId,
        version,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      logger.error('❌ Association rules batch job failed', { batchId, error });
      throw error;
    }
  }

  async executeHybridJob(_job: Job): Promise<void> {
    const batchId = uuidv4();
    const version = await this.getOrCreateSharedVersion();
    const startTime = Date.now();

    logger.info('Starting hybrid recommendations batch job', { batchId, version });

    try {
      // Step 1: Load recommendations from both algorithms for the shared version
      logger.info('Loading recommendations for hybrid blending', { batchId, version });
      const allVersionRecs = await this.recommendationRepo.findByVersion(version);

      // Filter to get algorithm-specific recommendations
      const collaborativeRecs = allVersionRecs.filter(
        (rec) => rec.algorithmType === 'collaborative'
      );
      const associationRecs = allVersionRecs.filter(
        (rec) => rec.algorithmType === 'association'
      );

      logger.info('Loaded recommendations from both algorithms', {
        batchId,
        version,
        collaborativeCount: collaborativeRecs.length,
        associationCount: associationRecs.length,
      });

      // Step 2: Validate that we have recommendations from both algorithms
      if (collaborativeRecs.length === 0) {
        logger.error('Cannot generate hybrid recommendations: no collaborative recommendations found', {
          batchId,
          version,
        });
        throw new Error(
          `No collaborative recommendations found for version ${version}. Run collaborative job first.`
        );
      }

      if (associationRecs.length === 0) {
        logger.error('Cannot generate hybrid recommendations: no association recommendations found', {
          batchId,
          version,
        });
        throw new Error(
          `No association recommendations found for version ${version}. Run association-rules job first.`
        );
      }

      // Step 3: Generate hybrid recommendations
      logger.info('Generating hybrid recommendations', { batchId, version });
      const hybridRecommendations = await this.generateHybridRecommendations(
        collaborativeRecs,
        associationRecs,
        version,
        batchId
      );

      if (hybridRecommendations.length === 0) {
        logger.warn('No hybrid recommendations generated', { batchId, version });
        logger.info('✅ Hybrid recommendations batch job completed (no recommendations generated)', {
          batchId,
          version,
          duration: Date.now() - startTime,
        });
        return;
      }

      // Step 4: Save hybrid recommendations
      logger.info('Saving hybrid recommendations', {
        batchId,
        version,
        count: hybridRecommendations.length,
      });
      await this.recommendationRepo.bulkUpsert(hybridRecommendations);
      logger.info('Hybrid recommendations saved successfully', { batchId });

      // Step 5: Validate quality metrics
      logger.info('Validating hybrid recommendation quality', { batchId, version });
      const metrics = await this.validateQuality(hybridRecommendations);
      logger.info('Hybrid quality metrics calculated', { batchId, version, metrics });

      logger.info('✅ Hybrid recommendations batch job completed', {
        batchId,
        version,
        duration: Date.now() - startTime,
        hybridCount: hybridRecommendations.length,
      });
    } catch (error) {
      logger.error('❌ Hybrid recommendations batch job failed', { batchId, error });
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
    const totalProducts = await this.productRepo.size();
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
   * Generates hybrid recommendations by blending collaborative and association recommendations.
   * 
   * This method blends recommendations from both algorithms per product using the RecommendationEngine.
   * 
   * @param collaborativeRecs - Collaborative filtering recommendations
   * @param associationRecs - Association rules recommendations
   * @param version - The version string for this batch
   * @param batchId - The batch ID for logging
   * @returns Array of hybrid recommendations, or empty array if blending is not possible
   */
  private async generateHybridRecommendations(
    collaborativeRecs: Recommendation[],
    associationRecs: Recommendation[],
    version: string,
    batchId: string
  ): Promise<Recommendation[]> {
    logger.info('Starting hybrid recommendation generation', {
      batchId,
      version,
      collaborativeCount: collaborativeRecs.length,
      associationCount: associationRecs.length,
    });

    // If either recommendation set is empty, cannot generate hybrid
    if (collaborativeRecs.length === 0 && associationRecs.length === 0) {
      logger.warn('Cannot generate hybrid recommendations: both recommendation sets are empty', {
        batchId,
        version,
      });
      return [];
    }

    if (collaborativeRecs.length === 0) {
      logger.warn('Cannot generate hybrid recommendations: no collaborative recommendations found', {
        batchId,
        version,
      });
      return [];
    }

    if (associationRecs.length === 0) {
      logger.warn('Cannot generate hybrid recommendations: no association recommendations found', {
        batchId,
        version,
      });
      return [];
    }

    logger.info('Found recommendations from both algorithms', {
      batchId,
      version,
      collaborativeCount: collaborativeRecs.length,
      associationCount: associationRecs.length,
    });

    // Create maps of productId -> recommendations for quick lookup
    const collaborativeRecsMap = new Map<string, Recommendation>();
    for (const rec of collaborativeRecs) {
      collaborativeRecsMap.set(rec.productId, rec);
    }

    const associationRecsMap = new Map<string, Recommendation>();
    for (const rec of associationRecs) {
      associationRecsMap.set(rec.productId, rec);
    }

    // Get all unique productIds that have recommendations in either algorithm
    const allProductIds = new Set<string>();
    for (const rec of collaborativeRecs) {
      allProductIds.add(rec.productId);
    }
    for (const rec of associationRecs) {
      allProductIds.add(rec.productId);
    }

    // Compute context-aware weights (no user context in batch mode)
    const weights = this.recommendationEngine.computeContextAwareWeights(
      true, // We have collaborative data
      true, // We have association data
      false // No user purchase history in batch mode
    );

    logger.info('Computed blending weights', {
      batchId,
      version,
      weights,
    });

    // Generate hybrid recommendations for each product
    const hybridRecommendations: Recommendation[] = [];
    const topN = config.PRE_COMPUTE_TOP_N;

    for (const productId of allProductIds) {
      const collaborativeRec = collaborativeRecsMap.get(productId);
      const associationRec = associationRecsMap.get(productId);

      // Convert to algorithm input format
      const collaborative = collaborativeRec
        ? collaborativeRec.recommendations.map((r) => ({ productId: r.productId, score: r.score }))
        : [];

      const association = associationRec
        ? associationRec.recommendations.map((r) => ({ productId: r.productId, score: r.score }))
        : [];

      // Skip if we don't have recommendations from at least one algorithm
      if (collaborative.length === 0 && association.length === 0) {
        continue;
      }

      // Blend recommendations for this product
      const blendedRecs = this.recommendationEngine.blendRecommendations(
        collaborative,
        association,
        weights,
        topN
      );

      if (blendedRecs.length > 0) {
        hybridRecommendations.push({
          productId,
          algorithmType: 'hybrid',
          recommendations: blendedRecs,
          version,
          batchId,
          createdAt: new Date(),
        });
      }
    }

    logger.info('Generated hybrid recommendations', {
      batchId,
      version,
      hybridCount: hybridRecommendations.length,
      totalProducts: allProductIds.size,
    });

    return hybridRecommendations;
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
