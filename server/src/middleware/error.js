import { ZodError } from 'zod';
import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: { message: `No route for ${req.method} ${req.originalUrl}` } });
};

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export const errorHandler = (error, req, res, _next) => {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: { message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
  }

  // A schema parsed outside the validate() middleware (e.g. a route param).
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: {
        message: 'Please check the highlighted fields',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || 'request',
          message: issue.message,
        })),
      },
    });
  }

  // Postgres unique violation — surface something a human can act on.
  if (error.code === '23505') {
    return res.status(409).json({ error: { message: 'That record already exists' } });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: { message: 'Referenced record does not exist' } });
  }

  console.error('[api] unhandled error:', error);
  res.status(500).json({
    error: {
      message: 'Something went wrong on our side. Please try again.',
      ...(config.isProduction ? {} : { debug: error.message, stack: error.stack }),
    },
  });
};
