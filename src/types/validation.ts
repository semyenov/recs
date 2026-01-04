import { z } from 'zod';

// Product Validation
export const productAttributeSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const productAttributesSchema = z.record(productAttributeSchema).optional();

export const productSchema = z.object({
  _id: z.string().min(1),
  name: z.string().min(1).optional(),
  fullName: z.string().optional(),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  attributes: productAttributesSchema,
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

// Order Validation
export const productInOrderSchema = z.object({
  name: z.string(),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  status: z.string(),
});

export const orderSchema = z.object({
  _id: z.string().min(1),
  number: z.string().optional(),
  name: z.string().optional(),
  contragent: z.string().optional(),
  contragentId: z.string().min(1),
  manager: z.string().optional(),
  managerId: z.string().optional(),
  products: z.record(productInOrderSchema).refine((products) => Object.keys(products).length > 0, {
    message: 'Products object must have at least one product',
  }),
  summary: z.number().positive(),
  date: z.coerce.date().optional(),
  createdDate: z.coerce.date().optional(),
  saleDate: z.coerce.date().optional(),
  status: z.string().optional(),
  posted: z.boolean().optional(),
  deleted: z.boolean().optional(),
  enabled: z.boolean().optional(),
  size: z.number().int().positive().optional(),
  timestamp: z.number().optional(),
  ref: z.string().optional(),
  dataVersion: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  __v: z.number().optional(),
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
