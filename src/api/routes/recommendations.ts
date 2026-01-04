import { Router } from 'express';
import { RecommendationRepository, OrderRepository } from '../../storage/repositories';
import { redisClient } from '../../storage/redis';
import { recommendationQuerySchema } from '../../types/validation';
import { logger } from '../../config/logger';
import { RecommendationResponse, Recommendation } from '../../types';
import { CollaborativeFilter } from '../../algorithms/collaborative-filtering';
import { RecommendationEngine } from '../../engine/recommendation-engine';

const router = Router();
const recommendationRepo = new RecommendationRepository();
const orderRepo = new OrderRepository();
const collaborativeFilter = new CollaborativeFilter();
const recommendationEngine = new RecommendationEngine();

/**
 * Helper: Load collaborative similarity matrix from pre-computed recommendations
 */
async function loadCollaborativeSimilarityMatrix(
  version: string
): Promise<Map<string, Array<{ productId: string; score: number }>>> {
  const cacheKey = `collab_similarity:${version}`;
  let matrix = await redisClient.get<Map<string, Array<{ productId: string; score: number }>>>(cacheKey);

  if (!matrix) {
    // Load from MongoDB and build matrix
    const recommendations = await recommendationRepo.findByVersion(version);
    matrix = new Map();

    for (const rec of recommendations) {
      if (rec.algorithmType === 'collaborative') {
        const similar = rec.recommendations.map((r) => ({
          productId: r.productId,
          score: r.score,
        }));
        matrix.set(rec.productId, similar);
      }
    }

    // Cache for 4 hours
    await redisClient.set(cacheKey, matrix, 14400);
  }

  return matrix;
}

/**
 * Helper: Convert stored recommendations to algorithm input format
 */
function convertRecommendationsToAlgorithmFormat(
  recommendations: Array<{ productId: string; score: number }>
): Array<{ productId: string; score: number }> {
  return recommendations.map((r) => ({
    productId: r.productId,
    score: r.score,
  }));
}

/**
 * GET /v1/products/:productId/frequently-bought-with
 * Get association-based recommendations
 */
router.get('/products/:productId/frequently-bought-with', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const query = recommendationQuerySchema.parse(req.query);

    const currentVersion = await redisClient.get<string>('rec:current_version');
    if (!currentVersion) {
      res.status(503).json({ error: 'Recommendations not available yet' });
      return;
    }

    const dbRec = await recommendationRepo.findByProductId(productId, currentVersion);

    if (!dbRec || dbRec.algorithmType !== 'association') {
      res.status(404).json({ error: 'Association recommendations not available' });
      return;
    }

    const response: RecommendationResponse = {
      productId,
      recommendations: dbRec.recommendations
        .slice(query.offset, query.offset + query.limit)
        .map((r, idx) => ({
          productId: r.productId,
          score: r.score,
          rank: query.offset + idx + 1,
        })),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: dbRec.recommendations.length,
        hasMore: query.offset + query.limit < dbRec.recommendations.length,
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/contragents/:contragentId/recommended
 * Get personalized recommendations for a contragent
 */
router.get('/contragents/:contragentId/recommended', async (req, res, next) => {
  try {
    const { contragentId } = req.params;
    const query = recommendationQuerySchema.parse(req.query);
    const startTime = Date.now();

    // Get current version
    const currentVersion = await redisClient.get<string>('rec:current_version');
    if (!currentVersion) {
      res.status(503).json({ error: 'Recommendations not available yet' });
      return;
    }

    // Try cache first
    const cacheKey = `contragent_recs:${contragentId}:${currentVersion}`;
    let cachedResponse = await redisClient.get<RecommendationResponse & { contragentId: string }>(
      cacheKey
    );
    let cacheHit = true;

    if (!cachedResponse) {
      cacheHit = false;

      // Load contragent's order history
      const contragentOrders = await orderRepo.findByContragentId(contragentId);
      const hasPurchaseHistory = contragentOrders.length > 0;

      let recommendations: Array<{ productId: string; score: number }> = [];

      if (hasPurchaseHistory) {
        // Use collaborative filtering
        try {
          const similarityMatrix = await loadCollaborativeSimilarityMatrix(currentVersion);
          const topN = query.limit + query.offset + 50; // Get extra for pagination
          recommendations = collaborativeFilter.getUserRecommendations(
            contragentId,
            contragentOrders,
            similarityMatrix,
            topN
          );
        } catch (error) {
          logger.warn('Failed to get collaborative recommendations', {
            contragentId,
            error,
          });
        }
      }

      // Cold start: return empty recommendations if no purchase history
      if (recommendations.length === 0) {
        logger.info('No recommendations available for contragent with no purchase history', {
          contragentId,
        });
      }

      // Apply pagination
      const paginatedRecs = recommendations.slice(query.offset, query.offset + query.limit);

      const response: RecommendationResponse & { contragentId: string } = {
        contragentId,
        productId: contragentId, // Use contragentId as productId for compatibility
        recommendations: paginatedRecs.map((r, idx) => ({
          productId: r.productId,
          score: r.score,
          rank: query.offset + idx + 1,
        })),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: recommendations.length,
          hasMore: query.offset + query.limit < recommendations.length,
        },
        metadata: {
          version: currentVersion,
          cacheHit,
          computeTime: Date.now() - startTime,
        },
      };

      // Cache for 2 hours
      await redisClient.set(cacheKey, response, 7200);
      cachedResponse = response;
    }

    res.json(cachedResponse);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/products/:productId/recommendations
 * Get hybrid recommendations (all algorithms combined)
 */
router.get('/products/:productId/recommendations', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const query = recommendationQuerySchema.parse(req.query);
    const startTime = Date.now();

    // Get current version
    const currentVersion = await redisClient.get<string>('rec:current_version');
    if (!currentVersion) {
      res.status(503).json({ error: 'Recommendations not available yet' });
      return;
    }

    // Try cache first
    const contragentId = (req.query.contragentId as string) || undefined;
    const cacheKey = contragentId
      ? `hybrid_recs:${productId}:${contragentId}:${currentVersion}`
      : `hybrid_recs:${productId}:${currentVersion}`;
    let cachedResponse = await redisClient.get<RecommendationResponse>(cacheKey);
    let cacheHit = true;

    if (!cachedResponse) {
      cacheHit = false;

      // Load recommendations from both algorithms
      // Query MongoDB directly to get recommendations by algorithm type
      const { mongoClient } = await import('../../storage/mongo');
      const db = mongoClient.getDb();
      const [collaborativeRec, associationRec] = await Promise.all([
        db
          .collection<Recommendation>('recommendations')
          .findOne({ productId, version: currentVersion, algorithmType: 'collaborative' }),
        db
          .collection<Recommendation>('recommendations')
          .findOne({ productId, version: currentVersion, algorithmType: 'association' }),
      ]);

      // Check if contragent has purchase history (for context-aware weights)
      let contragentHasPurchaseHistory = false;
      if (contragentId) {
        const contragentOrders = await orderRepo.findByContragentId(contragentId);
        contragentHasPurchaseHistory = contragentOrders.length > 0;
      }

      // Convert to algorithm input format
      const collaborative = collaborativeRec
        ? convertRecommendationsToAlgorithmFormat(collaborativeRec.recommendations || [])
        : [];
      const association = associationRec
        ? convertRecommendationsToAlgorithmFormat(associationRec.recommendations || [])
        : [];

      // Compute context-aware weights
      const weights = recommendationEngine.computeContextAwareWeights(
        collaborative.length > 0,
        association.length > 0,
        contragentHasPurchaseHistory
      );

      // Blend recommendations
      const topN = query.limit + query.offset + 50; // Get extra for pagination
      const blendedRecs = recommendationEngine.blendRecommendations(
        collaborative,
        association,
        weights,
        topN
      );

      // Apply pagination
      const paginatedRecs = blendedRecs.slice(query.offset, query.offset + query.limit);

      const response: RecommendationResponse = {
        productId,
        recommendations: paginatedRecs.map((r, idx) => ({
          productId: r.productId,
          score: r.score,
          rank: query.offset + idx + 1,
        })),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: blendedRecs.length,
          hasMore: query.offset + query.limit < blendedRecs.length,
        },
        metadata: {
          version: currentVersion,
          cacheHit,
          computeTime: Date.now() - startTime,
        },
      };

      // Cache for 4 hours
      await redisClient.set(cacheKey, response, 14400);
      cachedResponse = response;
    }

    res.json(cachedResponse);
  } catch (error) {
    next(error);
  }
});

export default router;
