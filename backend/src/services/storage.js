import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { badRequest, AppError, ERROR_CODES } from '../utils/errors.js';

/**
 * File storage abstraction. v1 ships a local-disk driver using the same
 * object-key idiom as S3/MinIO; the database stores only the object key.
 * `STORAGE_DRIVER=s3` is reserved for the S3-compatible driver for when a
 * bucket is available (MinIO for local dev, AWS S3 in production).
 */

const MAGIC_BYTES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [0x52, 0x49, 0x46, 0x46],
  mp4: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
  mov: [0x00, 0x00, 0x00, 0x14],
  pdf: [0x25, 0x50, 0x44, 0x46],
};

function startsWith(buf, magic) {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (buf[i] !== magic[i]) return false;
  }
  return true;
}

/** Detect the real type by magic-byte signature, never by client MIME or extension. */
export function detectType(buf) {
  if (startsWith(buf, MAGIC_BYTES.jpeg)) return 'jpeg';
  if (startsWith(buf, MAGIC_BYTES.png)) return 'png';
  if (startsWith(buf, MAGIC_BYTES.pdf)) return 'pdf';
  if (buf.length >= 12 && startsWith(buf, MAGIC_BYTES.webp) && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.length >= 8 && startsWith(buf, MAGIC_BYTES.mp4)) return 'mp4';
  if (buf.length >= 4 && startsWith(buf, MAGIC_BYTES.mov)) return 'mov';
  return null;
}

export const TYPE_MAP = {
  image: ['jpeg', 'png', 'webp'],
  video: ['mp4', 'mov'],
  document: ['pdf', 'jpeg', 'png'],
};

export const SIZE_LIMITS = {
  'profile-picture': 5 * 1024 * 1024, // 5 MB
  video: 200 * 1024 * 1024, // 200 MB
  document: 10 * 1024 * 1024, // 10 MB
};

const MIME_BY_TYPE = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
};

class LocalDriver {
  constructor() {
    this.root = path.resolve(process.cwd(), 'storage', 'uploads');
    fs.mkdirSync(this.root, { recursive: true });
  }

  async put(buffer, { contentType, kind, detectedType }) {
    const key = `${kind}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${detectedType}`;
    const absolute = path.join(this.root, ...key.split('/'));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, buffer, { flag: 'wx' });
    return { key, url: `/uploads/${key}` };
  }
}

const driver = new LocalDriver();

function assertType(actualType, acceptedTypes) {
  if (!acceptedTypes.includes(actualType)) {
    throw badRequest(
      ERROR_CODES.FILE_TYPE_UNSUPPORTED,
      `File type "${actualType || 'unknown'}" is not allowed here.`,
      { allowed: acceptedTypes },
    );
  }
}

function assertSize(sizeBytes, limit) {
  if (sizeBytes > limit) {
    throw new AppError(
      ERROR_CODES.FILE_TOO_LARGE,
      `File is too large. Maximum allowed is ${Math.round(limit / (1024 * 1024))} MB.`,
      400,
      { maxBytes: limit },
    );
  }
}

/**
 * Validates and stores an uploaded file buffer.
 * @param {{ buffer: Buffer, category: 'image'|'video'|'document', uploadKind: 'profile-picture'|'video'|'document', maxBytes?: number }} input
 */
export async function storeUpload({ buffer, category, uploadKind, maxBytes }) {
  const limit = maxBytes ?? SIZE_LIMITS[uploadKind];
  assertSize(buffer.length, limit);

  const actualType = detectType(buffer.subarray(0, 16));
  assertType(actualType, TYPE_MAP[category] || []);

  const { key, url } = await driver.put(buffer, {
    contentType: MIME_BY_TYPE[actualType],
    kind: uploadKind,
    detectedType: actualType,
  });

  return {
    key,
    url,
    detectedType: actualType,
    mimeType: MIME_BY_TYPE[actualType],
    sizeBytes: buffer.length,
  };
}

export function fileUrl(key) {
  if (!key) return null;
  return `/uploads/${key}`;
}