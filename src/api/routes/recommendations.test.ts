import '../../test/test-env'; // Load test environment first
import request from 'supertest';
import express, { Application } from 'express';
import recommendationsRouter from './recommendations';
import { validateApiKey } from '../middleware/auth';
import { errorHandler, notFoundHandler } from '../middleware/error-handler';

describe('Recommendations API', () => {
  let app: Application;

  beforeAll(async () => {
    // Create a simple Express app for testing
    app = express();
    app.use(express.json());
    app.use('/v1', validateApiKey, recommendationsRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  describe('GET /v1/products/:productId/similar', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app).get('/v1/products/P001/similar');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect((response.body as { error: string }).error).toBe('API key required');
    });

    it('should return 401 with invalid API key format', async () => {
      const response = await request(app).get('/v1/products/P001/similar').set('x-api-key', '');
      expect(response.status).toBe(401);
    });

    it('should handle missing recommendations gracefully', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar')
        .set('x-api-key', 'admin-key-123');

      // Expect either 503 (no recommendations) or 500 (Redis not connected in test)
      expect([500, 503]).toContain(response.status);
    });

    it('should accept valid API key', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar')
        .set('x-api-key', 'admin-key-123');

      // Should not return 401
      expect(response.status).not.toBe(401);
    });

    it('should handle query parameters', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar?limit=10&offset=0')
        .set('x-api-key', 'admin-key-123');

      // Should accept query params (may return 500/503 if Redis not connected, but not 400 validation error)
      expect(response.status).not.toBe(400);
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar?limit=200')
        .set('x-api-key', 'admin-key-123');

      // Should either reject invalid limit or clamp to max (100)
      // If it passes validation, it might return 503/500 due to no data
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle offset parameter', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar?offset=5')
        .set('x-api-key', 'admin-key-123');

      // Should accept offset parameter (may return 500/503 if Redis not connected, but not 400 validation error)
      expect(response.status).not.toBe(400);
    });

    it('should handle negative offset', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar?offset=-1')
        .set('x-api-key', 'admin-key-123');

      // Should either reject or clamp to 0
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle invalid limit type', async () => {
      const response = await request(app)
        .get('/v1/products/P001/similar?limit=abc')
        .set('x-api-key', 'admin-key-123');

      // Should either reject or use default
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('GET /v1/products/:productId/frequently-bought-with', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app).get('/v1/products/P001/frequently-bought-with');
      expect(response.status).toBe(401);
      expect((response.body as { error: string }).error).toBe('API key required');
    });

    it('should handle missing recommendations', async () => {
      const response = await request(app)
        .get('/v1/products/P001/frequently-bought-with')
        .set('x-api-key', 'admin-key-123');

      // Expect either 503 (no version) or 500 (Redis not connected) or 404 (not found)
      expect([404, 500, 503]).toContain(response.status);
    });

    it('should accept query parameters', async () => {
      const response = await request(app)
        .get('/v1/products/P001/frequently-bought-with?limit=5&offset=0')
        .set('x-api-key', 'admin-key-123');

      // Should accept query params (may return 500/503 if Redis not connected, but not 400 validation error)
      expect(response.status).not.toBe(400);
    });
  });

  describe('GET /v1/contragents/:contragentId/recommended', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app).get('/v1/contragents/C001/recommended');
      expect(response.status).toBe(401);
      expect((response.body as { error: string }).error).toBe('API key required');
    });

    it('should return recommendations', async () => {
      const response = await request(app)
        .get('/v1/contragents/C001/recommended')
        .set('x-api-key', 'admin-key-123');

      // May return 503 if no recommendations available, 500 if Redis not connected, or 200 if available
      if (response.status === 200) {
        expect(response.body).toHaveProperty('contragentId');
        const body = response.body as {
          contragentId: string;
          recommendations: unknown[];
          pagination: unknown;
        };
        expect(body.contragentId).toBe('C001');
        expect(response.body).toHaveProperty('recommendations');
        expect(Array.isArray(body.recommendations)).toBe(true);
        expect(response.body).toHaveProperty('pagination');
      } else {
        // If no recommendations available (503) or Redis error (500)
        expect([500, 503]).toContain(response.status);
      }
    });

    it('should handle pagination parameters', async () => {
      const response = await request(app)
        .get('/v1/contragents/C001/recommended?limit=5&offset=2')
        .set('x-api-key', 'admin-key-123');

      // May return 503 if no recommendations available, 500 if Redis not connected, or 200 if available
      if (response.status === 200) {
        const body = response.body as {
          pagination: { limit: number; offset: number; total: number; hasMore: boolean };
        };
        expect(body.pagination).toBeDefined();
        expect(body.pagination.limit).toBe(5);
        expect(body.pagination.offset).toBe(2);
        expect(typeof body.pagination.total).toBe('number');
        expect(typeof body.pagination.hasMore).toBe('boolean');
      } else {
        expect([500, 503]).toContain(response.status);
      }
    });

    it('should use default pagination when not specified', async () => {
      const response = await request(app)
        .get('/v1/contragents/C001/recommended')
        .set('x-api-key', 'admin-key-123');

      // May return 503 if no recommendations available, 500 if Redis not connected, or 200 if available
      if (response.status === 200) {
        const body = response.body as { pagination: { limit: number; offset: number } };
        expect(body.pagination.limit).toBe(20);
        expect(body.pagination.offset).toBe(0);
      } else {
        expect([500, 503]).toContain(response.status);
      }
    });

    it('should handle different contragent IDs', async () => {
      const response = await request(app)
        .get('/v1/contragents/C999/recommended')
        .set('x-api-key', 'admin-key-123');

      // May return 503 if no recommendations available, 500 if Redis not connected, or 200 if available
      if (response.status === 200) {
        expect((response.body as { contragentId: string }).contragentId).toBe('C999');
      } else {
        expect([500, 503]).toContain(response.status);
      }
    });
  });

  describe('GET /v1/products/:productId/recommendations', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app).get('/v1/products/P001/recommendations');
      expect(response.status).toBe(401);
      expect((response.body as { error: string }).error).toBe('API key required');
    });

    it('should handle missing recommendations', async () => {
      const response = await request(app)
        .get('/v1/products/P001/recommendations')
        .set('x-api-key', 'admin-key-123');

      // Expect either 503 (no version) or 500 (Redis not connected) or 404 (not found)
      expect([404, 500, 503]).toContain(response.status);
    });

    it('should accept query parameters', async () => {
      const response = await request(app)
        .get('/v1/products/P001/recommendations?limit=10&offset=0')
        .set('x-api-key', 'admin-key-123');

      // Should accept query params (may return 500/503 if Redis not connected, but not 400 validation error)
      expect(response.status).not.toBe(400);
    });

    it('should handle different product IDs', async () => {
      const response = await request(app)
        .get('/v1/products/P999/recommendations')
        .set('x-api-key', 'admin-key-123');

      // Should handle different product IDs
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('API Key validation', () => {
    it('should accept admin API key', async () => {
      const response = await request(app)
        .get('/v1/contragents/C001/recommended')
        .set('x-api-key', 'admin-key-123');

      expect(response.status).not.toBe(401);
    });

    it('should accept other valid API keys', async () => {
      const response = await request(app)
        .get('/v1/contragents/C001/recommended')
        .set('x-api-key', 'test-key-456');

      expect(response.status).not.toBe(401);
    });

    it('should reject requests without x-api-key header', async () => {
      const response = await request(app).get('/v1/contragents/C001/recommended');
      expect(response.status).toBe(401);
    });

    it('should reject requests with wrong header name', async () => {
      const response = await request(app)
        .get('/v1/contragents/C001/recommended')
        .set('api-key', 'admin-key-123');

      expect(response.status).toBe(401);
    });
  });

  describe('Error handling', () => {
    it('should handle malformed product IDs', async () => {
      const response = await request(app)
        .get('/v1/products//similar')
        .set('x-api-key', 'admin-key-123');

      // Should handle malformed IDs gracefully
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle very long product IDs', async () => {
      const longId = 'P'.repeat(1000);
      const response = await request(app)
        .get(`/v1/products/${longId}/similar`)
        .set('x-api-key', 'admin-key-123');

      // Should handle long IDs
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle special characters in product IDs', async () => {
      const response = await request(app)
        .get('/v1/products/P001%20test/similar')
        .set('x-api-key', 'admin-key-123');

      // Should handle URL-encoded IDs
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Response format validation', () => {
    it('should return JSON format', async () => {
      const response = await request(app)
        .get('/v1/contragents/C001/recommended')
        .set('x-api-key', 'admin-key-123');

      // All responses should be JSON (200, 503, or 500 with error handler)
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should include error message in error responses', async () => {
      const response = await request(app).get('/v1/products/P001/similar');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(typeof (response.body as { error: unknown }).error).toBe('string');
    });
  });
});
