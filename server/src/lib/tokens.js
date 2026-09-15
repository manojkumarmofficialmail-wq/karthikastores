import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query, queryOne } from '../db.js';

/** Short lived bearer token sent in the Authorization header. */
export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role, name: user.name }, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenTtl,
    issuer: 'karthika-stores',
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, config.auth.jwtSecret, { issuer: 'karthika-stores' });

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Long lived refresh token. The raw value goes to an httpOnly cookie; only
 * its SHA-256 lives in the database, so a dump of the table is not replayable.
 */
export const issueRefreshToken = async (userId) => {
  const raw = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.auth.refreshTokenDays * 86_400_000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(raw), expiresAt]
  );
  return { raw, expiresAt };
};

export const findValidRefreshToken = (raw) =>
  queryOne(
    `SELECT rt.id, rt.user_id, u.role, u.name, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1
        AND rt.revoked_at IS NULL
        AND rt.expires_at > now()`,
    [hashToken(raw)]
  );

export const revokeRefreshToken = (raw) =>
  query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashToken(raw),
  ]);

export const revokeAllRefreshTokens = (userId) =>
  query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);

export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: config.auth.cookieSecure,
  sameSite: config.auth.cookieSameSite,
  path: '/api/auth',
  maxAge: config.auth.refreshTokenDays * 86_400_000,
});
