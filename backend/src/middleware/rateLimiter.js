import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'production' ? 450 : 2500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Rate limit exceeded. Please slow down and try again shortly.',
  },
});

export const messagingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Messaging rate limit exceeded. Please wait a moment before sending more messages.',
  },
});

export const mapsProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.nodeEnv === 'production' ? 45 : 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Map search and routing rate limit exceeded. Please wait a moment and try again.',
  },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again in 15 minutes.',
  },
});

