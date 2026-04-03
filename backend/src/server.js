/**
 * server.js
 *
 * Express application bootstrap.
 *
 * SEED STRATEGY:
 *   - On every start: sequelize.sync({ force:false, alter:false }) — safe, never drops tables
 *   - Seed only runs when RUN_SEED=true environment variable is set
 *   - This prevents race conditions when Railway cold-starts multiple instances simultaneously
 *   - To seed: set RUN_SEED=true in Railway → deploy → set back to false
 *
 * CORS:
 *   - Add your custom domain to ALLOWED_ORIGINS in Railway env var when ready
 *   - Format: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
 */

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const cron        = require('node-cron');
const path        = require('path');
const fs          = require('fs');

const logger             = require('./utils/logger');
const { sequelize }      = require('./models');
const { releaseExpiredLocks } = require('./utils/slotEngine');
const routes             = require('./routes');

const app  = express();
const PORT = process.env.PORT || 5000;

// Required for Railway / reverse-proxy setups (rate-limiter uses req.ip)
app.set('trust proxy', 1);

// ── Ensure uploads directory exists ───────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

// ── CORS ───────────────────────────────────────────────────────────────────────
// Base origins always allowed
const baseOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://frontendmedicarehospitaldemo-production.up.railway.app',
];

// Allow adding extra origins via environment variable (comma-separated)
const extraOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = [...new Set([...baseOrigins, ...extraOrigins])];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development, allow everything for easier testing
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error(`CORS blocked: ${origin} not in allowed list`));
  },
  methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:  true,
}));
app.options('*', cors()); // Handle all preflight requests

// ── Rate limiting ──────────────────────────────────────────────────────────────
// General API: 500 req/15min per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
}));
// OTP endpoint: 10 req/min per IP (prevent OTP spam)
app.use('/api/auth/send-otp', rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many OTP requests. Please wait 1 minute.' },
}));

// ── Body parsing & compression ────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static(uploadsDir));

// ── Health check (no auth required — used by Railway health probe) ────────────
app.get('/health', (_req, res) => res.json({
  status:    'OK',
  service:   'MediCare Hospital API',
  version:   '2.0.0',
  timestamp: new Date().toISOString(),
  env:       process.env.NODE_ENV || 'development',
  database:  'MySQL',
}));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    // Show full error in dev, generic message in production
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    // In development, include stack trace for easier debugging
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Cron: release expired slot locks every minute ────────────────────────────
cron.schedule('* * * * *', async () => {
  try {
    const released = await releaseExpiredLocks();
    if (released > 0) logger.info(`[CRON] Released ${released} expired slot lock(s)`);
  } catch (err) {
    logger.error('[CRON] Lock release error:', err.message);
  }
});

// ── Application startup ───────────────────────────────────────────────────────
async function start() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('✅ MySQL database connected');

    // Sync models — force:false = never drops tables; alter:false = never modifies schema
    // Run `npm run seed` (or set RUN_SEED=true) to create fresh tables
    await sequelize.sync({ force: false, alter: false });
    logger.info('✅ Database schema ready');

    // Conditional seeding — only when RUN_SEED=true (set in Railway env, then unset after)
    if (process.env.RUN_SEED === 'true') {
      logger.info('🌱 RUN_SEED=true detected, running seed...');
      const seedDatabase = require('./utils/seed');
      await seedDatabase();
      logger.info('✅ Seed complete');
    }

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 MediCare API running on http://0.0.0.0:${PORT}`);
      logger.info(`💊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    logger.error('❌ Server startup failed:', err.message);
    logger.error(err.stack);
    process.exit(1);
  }
}

start();
module.exports = app;
