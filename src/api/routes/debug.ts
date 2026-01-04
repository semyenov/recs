import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { debugRateLimiter } from '../middleware/rate-limiter';
import { RecommendationRepository } from '../../storage/repositories';
import { redisClient } from '../../storage/redis';
import { DebugRecommendationResponse } from '../../types';

const router = Router();
const recommendationRepo = new RecommendationRepository();

/**
 * GET /debug/v1/recommendations/:productId
 * Debug endpoint with full score breakdown (admin only)
 */
router.get(
  '/recommendations/:productId',
  requireAdmin,
  debugRateLimiter,
  async (req, res, next) => {
    try {
      const { productId } = req.params;
      const explain = req.query.explain === 'true';

      const currentVersion = await redisClient.get<string>('rec:current_version');
      if (!currentVersion) {
        res.status(503).json({ error: 'Recommendations not available yet' });
        return;
      }

      const dbRec = await recommendationRepo.findByProductId(productId, currentVersion);

      if (!dbRec) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }

      const response: DebugRecommendationResponse = {
        productId,
        recommendations: dbRec.recommendations.map((r, idx) => ({
          productId: r._id,
          score: r.score,
          rank: idx + 1,
        })),
        debug: {
          scoreBreakdown: explain ? dbRec.recommendations.map((r) => r.breakdown) : [],
          batchId: dbRec.batchId,
          version: dbRec.version,
          cacheHit: false,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /debug/v1/rollback
 * Manual rollback to previous version (admin only)
 */
router.post('/rollback', requireAdmin, async (_req, res, next) => {
  try {
    const currentVersion = await redisClient.get<string>('rec:current_version');
    const previousVersion = await redisClient.get<string>('rec:previous_version');

    if (!previousVersion) {
      res.status(400).json({ error: 'No previous version available for rollback' });
      return;
    }

    // Atomic swap
    await redisClient.set('rec:current_version', previousVersion);
    await redisClient.set('rec:previous_version', currentVersion || '');

    res.json({
      message: 'Rollback successful',
      from: currentVersion,
      to: previousVersion,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
