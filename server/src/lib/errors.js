/** Error carrying an HTTP status so the error middleware can answer properly. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (details) this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, details);
export const unauthorized = (message = 'Please sign in to continue') => new ApiError(401, message);
export const forbidden = (message = 'You do not have access to this resource') => new ApiError(403, message);
export const notFound = (message = 'Not found') => new ApiError(404, message);
export const conflict = (message, details) => new ApiError(409, message, details);
export const unprocessable = (message, details) => new ApiError(422, message, details);
export const serviceUnavailable = (message) => new ApiError(503, message);
