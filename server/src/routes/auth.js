import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  signAccessToken,
  issueRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  refreshCookieOptions,
} from '../lib/tokens.js';
import { serializeUser } from '../lib/serialize.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config.js';

export const authRouter = Router();

// Credential endpoints are the cheapest thing to brute force, so they get a
// tighter budget than the global limiter.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 12 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10 digit Indian mobile number');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

/**
 * A hash of a value nobody can log in with, used to burn the same CPU on an
 * unknown mobile number as on a known one. Built lazily with the configured
 * cost factor so the two paths stay indistinguishable even if BCRYPT_ROUNDS
 * changes.
 */
let dummyHashPromise = null;
const dummyHash = () =>
  (dummyHashPromise ??= hashPassword(crypto.randomBytes(24).toString('hex')));

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  password: passwordSchema,
});

const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Enter your password'),
});

const sendSession = async (res, user) => {
  const { raw } = await issueRefreshToken(user.id);
  res.cookie(config.auth.cookieName, raw, refreshCookieOptions());
  return {
    user: serializeUser(user),
    accessToken: signAccessToken(user),
    // Also returned in the body so non-browser clients (and browsers whose
    // third-party cookie policy blocks the cookie) can still refresh.
    refreshToken: raw,
  };
};

authRouter.post(
  '/register',
  credentialLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, phone, password } = req.body;
    const email = req.body.email || null;

    const existing = await queryOne(
      `SELECT id FROM users WHERE phone = $1 OR ($2::text IS NOT NULL AND email = $2)`,
      [phone, email]
    );
    if (existing) throw conflict('An account with this mobile number or email already exists');

    const user = await queryOne(
      `INSERT INTO users (name, phone, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, email, role, preferences, created_at`,
      [name, phone, email, await hashPassword(password)]
    );
    await query(`INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);

    res.status(201).json(await sendSession(res, user));
  })
);

authRouter.post(
  '/login',
  credentialLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { phone, password } = req.body;
    const user = await queryOne(
      `SELECT id, name, phone, email, role, password_hash, preferences, is_active, created_at
         FROM users WHERE phone = $1`,
      [phone]
    );

    // Same message either way, and the same work either way: hashing a dummy
    // for an unknown number keeps the response time from revealing which
    // mobile numbers have accounts.
    const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
    if (!ok) throw unauthorized('Mobile number or password is incorrect');
    if (!user.is_active) throw unauthorized('This account has been deactivated');

    await query(`INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
    res.json(await sendSession(res, user));
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[config.auth.cookieName] ?? req.body?.refreshToken;
    if (!raw) throw unauthorized('No active session');

    const record = await findValidRefreshToken(raw);
    if (!record || !record.is_active) throw unauthorized('Session expired, please sign in again');

    // Rotate: a refresh token is single use, so a stolen one is detectable
    // and short lived.
    await revokeRefreshToken(raw);
    const user = await queryOne(
      `SELECT id, name, phone, email, role, preferences, created_at FROM users WHERE id = $1`,
      [record.user_id]
    );
    res.json(await sendSession(res, user));
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[config.auth.cookieName] ?? req.body?.refreshToken;
    if (raw) await revokeRefreshToken(raw);
    res.clearCookie(config.auth.cookieName, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await queryOne(
      `SELECT id, name, phone, email, role, preferences, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ user: serializeUser(user) });
  })
);

authRouter.patch(
  '/me',
  requireAuth,
  validate(
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
      // Bounded on purpose: this is a small key/value bag for checkout
      // defaults, not general purpose storage on the users table.
      preferences: z
        .record(z.union([z.string().max(120), z.number(), z.boolean(), z.null()]))
        .refine((value) => Object.keys(value).length <= 20, 'Too many preferences')
        .optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { name, email, preferences } = req.body;
    const user = await queryOne(
      `UPDATE users
          SET name = COALESCE($2, name),
              email = COALESCE($3, email),
              preferences = COALESCE($4, preferences)
        WHERE id = $1
      RETURNING id, name, phone, email, role, preferences, created_at`,
      [req.user.id, name ?? null, email === '' ? null : (email ?? null), preferences ?? null]
    );
    res.json({ user: serializeUser(user) });
  })
);

authRouter.post(
  '/change-password',
  requireAuth,
  credentialLimiter,
  validate(
    z.object({
      currentPassword: z.string().min(1, 'Enter your current password'),
      newPassword: passwordSchema,
    })
  ),
  asyncHandler(async (req, res) => {
    const record = await queryOne(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    if (!(await verifyPassword(req.body.currentPassword, record.password_hash))) {
      throw badRequest('Your current password is incorrect');
    }
    await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      req.user.id,
      await hashPassword(req.body.newPassword),
    ]);
    // Force every other device to sign in again.
    await revokeAllRefreshTokens(req.user.id);
    res.clearCookie(config.auth.cookieName, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true, message: 'Password updated. Please sign in again.' });
  })
);
