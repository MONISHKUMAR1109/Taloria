import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Access tokens are JVTs with ONLY the user_id in the payload. The role is
 * re-read from the users table on every request, so a role change by an admin
 * takes effect immediately and the token must never carry role claims.
 */
export function signAccessToken(userId) {
  return new Promise((resolve, reject) => {
    jwt.sign(
      { user_id: userId },
      env.jwtSecret,
      { algorithm: 'HS256', expiresIn: env.accessTokenTtl },
      (err, token) => (err ? reject(err) : resolve(token)),
    );
  });
}

export function verifyAccessToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, env.jwtSecret, (err, payload) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          const e = new Error('Access token expired.');
          e.code = 'TOKEN_EXPIRED';
          e.status = 401;
          return reject(e);
        }
        const e = new Error('Invalid access token.');
        e.code = 'TOKEN_INVALID';
        e.status = 401;
        return reject(e);
      }
      resolve(payload);
    });
  });
}

/**
 * Opaque refresh tokens: random 256-bit value. Only a SHA-256 hash is stored
 * in refresh_tokens. Tokens are rotated on every use.
 */
export function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function isTokenExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now();
}

export function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}