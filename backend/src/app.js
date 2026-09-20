import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from './config/env.js';
import { apiRateLimit } from './middleware/rateLimiters.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import athleteRoutes from './routes/athletes.routes.js';
import sportRoutes from './routes/sports.routes.js';
import tournamentRoutes from './routes/tournaments.routes.js';
import applicationRoutes from './routes/applications.routes.js';
import sponsorshipRoutes from './routes/sponsorships.routes.js';
import messageRoutes from './routes/messages.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import adminRoutes from './routes/admin.routes.js';
import publicRoutes from './routes/public.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: env.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Local-disk object storage (see services/storage.js).
app.use('/uploads', express.static(path.join(process.cwd(), 'storage', 'uploads'), { maxAge: '7d' }));

// Auth endpoints carry their own stricter rate limit (10/min/IP).
app.use('/api/auth', authRoutes);

// Everything else gets the sane API-wide limit.
const api = express.Router();
api.use(apiRateLimit);
api.use('/athletes', athleteRoutes);
api.use('/sports', sportRoutes);
api.use('/tournaments', tournamentRoutes);
api.use('/applications', applicationRoutes);
api.use('/sponsorships', sponsorshipRoutes);
api.use('/messages', messageRoutes);
api.use('/notifications', notificationRoutes);
api.use('/verification-requests', verificationRoutes);
api.use('/admin', adminRoutes);
api.use('/public', publicRoutes);
app.use('/api', api);

app.get('/health', (_req, res) => res.json({ success: true, status: 'ok', uptime: process.uptime() }));

// In production, serve the built frontend so a single service hosts the whole site.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist, { maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;