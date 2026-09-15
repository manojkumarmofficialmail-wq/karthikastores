import { unprocessable } from '../lib/errors.js';

/**
 * Validate `req[source]` against a zod schema and replace it with the parsed
 * value, so handlers only ever see data that survived validation.
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || source,
      message: issue.message,
    }));
    return next(unprocessable('Please check the highlighted fields', details));
  }
  if (source === 'query') {
    // Express 5 makes req.query a getter; assigning a parsed copy elsewhere
    // keeps both versions working.
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }
  next();
};
