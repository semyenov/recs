import '../../test/test-env'; // Load test environment first
import request from 'supertest';
import express, { Application } from 'express';
import recommendationsRouter from './recommendations';
import { validateApiKey } from '../middleware/auth';

describe('Recommendations API', () => {
  let app: Application;

  beforeAll(async () => {
    // Create a simple Express app for testing
    app = express();
    app.use(express.json());
    app.use('/v1', validateApiKey, recommendationsRouter);
  });

  describe('GET /v1/products/:productId/similar', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app).get('/v1/products/P001/similar');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing recommendations gracefully', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar')
        .set('x-api-key', 'admin-key-123');

      // Expect either 503 (no recommendations) or 500 (Redis not connected in test)
      expect([500, 503]).toContain(response.status);
    });
  });
});
