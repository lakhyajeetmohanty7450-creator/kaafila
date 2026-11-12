import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // PostgreSQL unique constraint violation
  if (err.code === '23505') {
    statusCode = 409;
    message = 'An account or record with that unique value already exists.';
    if (typeof err.constraint === 'string') {
      if (err.constraint.includes('email')) message = 'An account with this email already exists.';
      else if (err.constraint.includes('handle')) message = 'A rider with this handle already exists.';
      else if (err.constraint.includes('slug')) message = 'A record with this slug already exists.';
    }
  }

  // PostgreSQL invalid UUID / input syntax
  if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid identifier or value format.';
  }

  // PostgreSQL foreign key or check constraint violation
  if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record does not exist.';
  }

  if (err.code === '23514') {
    statusCode = 400;
    message = 'Input value violates field constraints.';
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(err.keyPattern || {});
    message = fields.length
      ? `An account or record with that ${fields.join(', ')} already exists.`
      : 'Duplicate record error.';
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const messages = Object.values(err.errors).map((e) => e.message);
    message = messages.join('. ');
  }

  // Mongoose invalid ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid identifier format for ${err.path}.`;
  }

  const response = {
    success: false,
    message,
  };

  if (env.nodeEnv === 'development' && statusCode >= 500) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

