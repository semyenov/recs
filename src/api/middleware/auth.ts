import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  userId?: string;
  isAdmin?: boolean;
}

/**
 * Middleware to validate API key
 */
export function validateApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  // Check if it's an admin key
  const isAdmin = config.adminApiKeys.includes(apiKey);

  // Attach to request
  req.apiKey = apiKey;
  req.isAdmin = isAdmin;

  next();
}

/**
 * Middleware to require admin privileges
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'Admin privileges required' });
    return;
  }

  next();
}

/**
 * Middleware to validate userId matches authenticated user
 */
export function validateUserId(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.params.userId || req.query.userId;

  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }

  // For now, simple validation - in production, verify JWT or session
  req.userId = userId as string;

  next();
}
