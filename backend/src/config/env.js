import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    // Allow a missing value only for vars with a documented default below.
    return undefined;
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10),

  bcryptCost: parseInt(process.env.BCRYPT_COST || '12', 10),

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Object storage (MinIO-compatible). Phase 1 stores keys only; the storage
  // service is stubbed until file upload lands in a later phase.
  storageEndpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
  storageBucket: process.env.STORAGE_BUCKET || 'taloria',
  storageAccessKey: process.env.STORAGE_ACCESS_KEY,
  storageSecretKey: process.env.STORAGE_SECRET_KEY,
  storageForcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
};

export default env;