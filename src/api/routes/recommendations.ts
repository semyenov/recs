import { Router } from 'express';
import { RecommendationRepository } from '../../storage/repositories';
import { redisClient } from '../../storage/redis';
import { recommendationQuerySchema } from '../../types/validation';
import { logger } from '../../config/logger';
import { RecommendationResponse } from '../../types';

const router = Router();
const recommendationRepo = new RecommendationRepository();

/**
 * GET /v1/products/:productId/similar
 * Get content-based similar products
 */
router.get('/products/:productId/similar', async (req, res, next) => {
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
    const cacheKey = `recs:${productId}:${currentVersion}`;
    let recommendations = await redisClient.get<RecommendationResponse>(cacheKey);
    let cacheHit = true;

    if (!recommendations) {
      // Fallback to MongoDB
      cacheHit = false;
      const dbRec = await recommendationRepo.findByProductId(productId, currentVersion);

      if (!dbRec) {
        res.status(404).json({ error: 'Product not found or no recommendations available' });
        return;
      }

      recommendations = {
        productId,
        recommendations: dbRec.recommendations
          .slice(query.offset, query.offset + query.limit)
          .map((r, idx) => ({
            productId: r._id,
            score: r.score,
            rank: query.offset + idx + 1,
          })),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: dbRec.recommendations.length,
          hasMore: query.offset + query.limit < dbRec.recommendations.length,
        },
        metadata: {
          version: currentVersion,
          cacheHit,
          computeTime: Date.now() - startTime,
        },
      };

      // Cache for future requests
      await redisClient.set(cacheKey, recommendations, 14400); // 4h TTL
    }

    res.json(recommendations);
  } catch (error) {
    next(error);
  }
});

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
          productId: r._id,
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
 * GET /v1/users/:userId/recommended
 * Get personalized recommendations for a user
 */
router.get('/users/:userId/recommended', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const query = recommendationQuerySchema.parse(req.query);

    // TODO: Implement user-based collaborative filtering
    // For now, return a placeholder
    logger.warn('User-based recommendations not yet implemented', { userId });

    res.json({
      userId,
      recommendations: [],
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: 0,
        hasMore: false,
      },
    });
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

    // TODO: Implement hybrid blending
    // For now, fallback to content-based
    logger.warn('Hybrid recommendations not yet fully implemented', { productId });

    const currentVersion = await redisClient.get<string>('rec:current_version');
    if (!currentVersion) {
      res.status(503).json({ error: 'Recommendations not available yet' });
      return;
    }

    const dbRec = await recommendationRepo.findByProductId(productId, currentVersion);

    if (!dbRec) {
      res.status(404).json({ error: 'Recommendations not available' });
      return;
    }

    const response: RecommendationResponse = {
      productId,
      recommendations: dbRec.recommendations
        .slice(query.offset, query.offset + query.limit)
        .map((r, idx) => ({
          productId: r._id,
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

export default router;
