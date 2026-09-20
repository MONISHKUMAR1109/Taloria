import bcrypt from 'bcryptjs';
import env from '../config/env.js';

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptCost);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}