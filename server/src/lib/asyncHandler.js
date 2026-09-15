/**
 * Express 4 does not forward rejected promises to the error middleware.
 * Wrap every async route handler with this.
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
