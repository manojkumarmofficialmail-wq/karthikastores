import { verifyAccessToken } from '../lib/tokens.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { queryOne } from '../db.js';

const readBearer = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

/** Attaches req.user when a valid access token is present; 401 otherwise. */
export const requireAuth = async (req, _res, next) => {
  try {
    const token = readBearer(req);
    if (!token) throw unauthorized();

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch (error) {
      throw unauthorized(
        error.name === 'TokenExpiredError' ? 'Your session expired, please sign in again' : 'Invalid session'
      );
    }

    // Re-read the user so a deactivated account or a role change takes effect
    // immediately rather than at the next token refresh.
    const user = await queryOne(
      `SELECT id, name, phone, email, role, is_active FROM users WHERE id = $1`,
      [claims.sub]
    );
    if (!user || !user.is_active) throw unauthorized('This account is no longer active');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/** Like requireAuth but never fails — used by endpoints with a guest mode. */
export const optionalAuth = async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) return next();
  try {
    const claims = verifyAccessToken(token);
    req.user = await queryOne(
      `SELECT id, name, phone, email, role, is_active FROM users WHERE id = $1 AND is_active`,
      [claims.sub]
    );
  } catch {
    // ignore: treat as guest
  }
  next();
};

export const requireAdmin = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Staff access only'));
  next();
};
