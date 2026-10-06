import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { validateEnv } from './config/validateEnv.js';
import { initDatabase } from './config/db.js';
import { seedDatabase } from './config/seed.js';
import { initSocketIO } from './socket/socketHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { initCronJobs } from './services/cronJobs.js';
import db from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import scanRoutes from './routes/scanRoutes.js';
import sectionRoutes from './routes/sectionRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import excuseRoutes from './routes/excuseRoutes.js';
import promptRoutes from './routes/promptRoutes.js';
import gamificationRoutes from './routes/gamificationRoutes.js';
import instructorRoutes from './routes/instructorRoutes.js';

dotenv.config();

// Fail-fast: crash immediately if required secrets are missing in production
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const allowedOrigins = CLIENT_URL.split(',').map(o => o.trim());

// Origin validation allowing whitelist, Render, localhost, LAN IPs (192.168.x.x, 10.x.x.x), and local tunnels
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) return true;
  if (origin.endsWith('.onrender.com')) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    // Allow localhost and loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    // Allow private LAN subnets
    if (host.startsWith('192.168.') || host.startsWith('10.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    // Allow localtunnel & ngrok tunnels
    if (host.endsWith('.loca.lt') || host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.io')) return true;
  } catch {
    // Malformed origin
  }

  return false;
};

// Initialize Socket.io with strict CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      callback(new Error(`Socket CORS blocked: ${origin}`));
    },
    methods: ['GET', 'POST']
  }
});
initSocketIO(io);

// ── Middleware ──────────────────────────────────────────────────────────────

// 1. Correlation IDs — trace every request across logs
app.use(requestIdMiddleware);

// 2. Security headers — OWASP A05, Clickjacking, MIME sniffing, XSS
// contentSecurityPolicy disabled to allow React SPA served from same origin
app.use(helmet({ contentSecurityPolicy: false }));

// 3. CORS — whitelist from CLIENT_URL env var, Render URLs, and LAN IPs for multi-device testing
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// 4. Rate limiters — OWASP A07: Identification & Authentication Failures
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 20,                   // 20 login attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});
app.use('/api/auth/login', authLimiter);

const scanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1-minute window
  max: 10,              // 10 scan attempts per IP per minute (anti replay-flood)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Scan rate limit exceeded. Please wait before retrying.' },
});
app.use('/api/scan', scanLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize database & auto-seed if empty
initDatabase();
seedDatabase();

// S-Class: Start background cron jobs (Early Warning System, etc.)
initCronJobs();

// ── Health / Readiness Probe ────────────────────────────────────────────────
// Real DB ping — not a stub. Load balancers and Render use this to decide
// whether your container is healthy and ready to serve traffic.
app.get('/api/health', (req, res) => {
  try {
    const row = db.prepare('SELECT 1 AS ok').get();
    res.json({
      status: 'ok',
      db: row?.ok === 1 ? 'connected' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'health_check_failed', message: err.message }));
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/excuses', excuseRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/instructor', instructorRoutes);

// Serve Frontend Production Build (if dist folder exists)
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    }
  });
}

// ── Global Error Handler ───────────────────────────────────────────────────
// Catches any error thrown by route handlers via next(err).
// SECURITY: Never expose err.message to clients in production (OWASP A05).
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  const isProd = process.env.NODE_ENV === 'production';

  // Structured JSON log — grep by requestId to trace the full request chain
  console.error(JSON.stringify({
    level: 'error',
    requestId,
    message: err.message,
    stack: isProd ? undefined : err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  }));

  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error' : err.message,
    requestId,
  });
});

// Start listening if not in Vercel serverless environment
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 CCDI QRScan Backend & Socket.io server running at http://localhost:${PORT}`);
    console.log(`📡 Real-time Socket.io gateway active`);
  });
}

export { app, server };
export default app;
