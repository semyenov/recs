import { Router } from 'express';
import { register, collectDefaultMetrics } from 'prom-client';

// Collect default metrics
collectDefaultMetrics({ prefix: 'recommendations_' });

const router = Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
router.get('/', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export default router;
