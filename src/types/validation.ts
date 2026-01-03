import { z } from 'zod';

// Product Validation
export const technicalPropertiesSchema = z.record(z.unknown()).optional();

export const productSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  technicalProperties: technicalPropertiesSchema.default({}),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

// Order Validation
export const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
});

export const orderSchema = z.object({
  orderId: z.string().min(1),
  userId: z.string().min(1),
  items: z.array(orderItemSchema).min(1),
  totalAmount: z.number().positive(),
  orderDate: z.coerce.date(),
  createdAt: z.coerce.date().optional(),
});

// Recommendation Query Validation
export const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  explain: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

export const userRecommendationQuerySchema = recommendationQuerySchema.extend({
  userId: z.string().min(1),
});

// API Key Validation
export const apiKeySchema = z.object({
  key: z.string().min(1),
  userId: z.string().optional(),
  isAdmin: z.boolean().default(false),
  rateLimit: z.number().int().positive().optional(),
  createdAt: z.coerce.date().optional(),
});

// Batch Job Config Validation
export const batchJobConfigSchema = z.object({
  jobName: z.string().min(1),
  batchSize: z.number().int().positive(),
  topN: z.number().int().positive(),
  minScore: z.number().min(0).max(1),
  diversityThreshold: z.number().min(0).max(1),
});

// Export types inferred from schemas
export type ProductInput = z.infer<typeof productSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
export type UserRecommendationQuery = z.infer<typeof userRecommendationQuerySchema>;
export type ApiKeyInput = z.infer<typeof apiKeySchema>;
export type BatchJobConfigInput = z.infer<typeof batchJobConfigSchema>;
