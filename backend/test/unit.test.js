import test from 'node:test';
import assert from 'node:assert/strict';
import { detectType, storeUpload, SIZE_LIMITS } from '../src/services/storage.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { hashRefreshToken, generateRefreshToken, hashOpaqueToken } from '../src/utils/tokens.js';
import { parsePagination } from '../src/utils/pagination.js';
import { assertStatsMatchTemplate } from '../src/services/statistics.js';
import { badRequest } from '../src/utils/errors.js';

test('detectType identifies formats by magic bytes', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const mp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 0]);

  assert.equal(detectType(jpeg), 'jpeg');
  assert.equal(detectType(png), 'png');
  assert.equal(detectType(webp), 'webp');
  assert.equal(detectType(mp4), 'mp4');
  assert.equal(detectType(pdf), 'pdf');
  assert.equal(detectType(Buffer.from('<?xml version="1.0"?>')), null);
});

test('storeUpload rejects type mismatches and oversized files by code', async () => {
  // A fake PNG uploaded to a video endpoint must fail with FILE_TYPE_UNSUPPORTED.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
  await assert.rejects(
    () => storeUpload({ buffer: png, category: 'video', uploadKind: 'video' }),
    (err) => err.code === 'FILE_TYPE_UNSUPPORTED',
  );

  const big = Buffer.alloc(SIZE_LIMITS['profile-picture'] + 1, 0x89);
  big[0] = 0x89; big[1] = 0x50; big[2] = 0x4e; big[3] = 0x47; big[5] = 0x0a; big[6] = 0x1a; big[7] = 0x0a;
  big[4] = 0x0d;
  await assert.rejects(
    () => storeUpload({ buffer: big, category: 'image', uploadKind: 'profile-picture' }),
    (err) => err.code === 'FILE_TOO_LARGE',
  );
});

test('password hashing uses bcrypt with cost factor 12', async () => {
  const hash = await hashPassword('a-secret');
  assert.ok(await verifyPassword('a-secret', hash));
  assert.ok(!(await verifyPassword('wrong', hash)));
  assert.match(hash, /^\$2[aby]\$12\$/);
});

test('refresh tokens are opaque and stored hashed', () => {
  const token = generateRefreshToken();
  assert.notEqual(token, hashRefreshToken(token));
  assert.equal(hashRefreshToken(token), hashRefreshToken(token));
  assert.equal(hashOpaqueToken('abc'), hashOpaqueToken('abc'));
  assert.notEqual(hashOpaqueToken('abc'), hashOpaqueToken('abd'));
});

test('parsePagination enforces pageSize max 100 and rejects bad input', () => {
  const req = (query) => ({ query });
  assert.equal(parsePagination(req({}), ['created_at']).pageSize, 20);
  assert.equal(parsePagination(req({ pageSize: '100' }), ['created_at']).pageSize, 100);
  assert.throws(() => parsePagination(req({ pageSize: '250' }), ['created_at']));
  assert.throws(() => parsePagination(req({ page: '0' }), ['created_at']));
  assert.throws(() => parsePagination(req({ sort: 'email; DROP TABLE' }), ['created_at']));
  assert.throws(() => parsePagination(req({ order: 'asc0' }), ['created_at']));
});

test('stat template rejects unknown and missing fields', () => {
  const template = [
    { key: 'goals', label: 'Goals', type: 'int' },
    { key: 'appearances', label: 'Appearances', type: 'int' },
  ];
  assert.throws(() => assertStatsMatchTemplate({ goals: 0 }, template), (e) => e.code === 'STAT_TEMPLATE_MISMATCH');
  assert.throws(() => assertStatsMatchTemplate({ goals: '3', appearances: 1 }, template), (e) => e.code === 'STAT_TEMPLATE_MISMATCH');
  assert.throws(() => assertStatsMatchTemplate({ goals: 1, appearances: 1, hacked: 1 }, template), (e) => e.code === 'STAT_TEMPLATE_MISMATCH');
  assert.doesNotThrow(() => assertStatsMatchTemplate({ goals: 3, appearances: 42 }, template));
});