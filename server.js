// server.js
const express = require('express');
require('dotenv').config();
const { validateBackendEnv } = require('./helpers/env');
validateBackendEnv(process.env);
const cors = require('cors');
const helmet = require('helmet');
const { connectDB } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const programRoutes = require('./routes/programRoutes');
const profileRoutes = require('./routes/profileRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const betaRoutes = require('./routes/betaRoutes');
const studioRoutes = require('./routes/studioRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const {
  notFoundHandler,
  errorHandler,
  authLimiter,
  walletLimiter,
} = require('./middleware/httpGuards');
const { requestIdMiddleware, requestLogMiddleware } = require('./middleware/requestId');
const { healthHandler } = require('./controllers/healthController');
const { log } = require('./helpers/logger');
const temporaryAccessMiddleware = require('./middleware/temporaryAccess');
const { createCorsOriginCallback } = require('./helpers/corsOrigins');


const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(requestIdMiddleware);
app.use(requestLogMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Add CORS middleware — static allowlist + vanity *.localhost (dev) and *.{root} (prod)
app.use(cors({
  origin: createCorsOriginCallback(),
  credentials: true,
}));

const PORT = process.env.PORT || 5001;

app.get('/', (req, res) => {
  res.send('After-school.tech backend running!');
});

app.get('/health', healthHandler);

// Remove old MongoDB test route - connection handled by centralized module

// Add temporary access middleware only for auth routes
// app.use('/api/auth', temporaryAccessMiddleware);

// Routes
app.use('/api/auth', authLimiter(), authRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/beta', betaRoutes);
app.use('/api/studio', studioRoutes);
app.use('/api/superadmin', superadminRoutes);
const orgsRoutes = require('./routes/orgsRoutes');
app.use('/api/orgs', orgsRoutes);
const walletRoutes = require('./routes/walletRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const statsRoutes = require('./routes/statsRoutes');
const missionRoutes = require('./routes/missionRoutes');
const levelRoutes = require('./routes/levelRoutes');
const studentAchievementRoutes = require('./routes/studentAchievements');
const interactionRoutes = require('./routes/interactionRoutes');
const pollRoutes = require('./routes/pollRoutes');
const wordCloudRoutes = require('./routes/wordCloudRoutes');
const scaleRoutes = require('./routes/scaleRoutes');
const storeRoutes = require('./routes/storeRoutes');
app.use('/api/wallet', walletLimiter(), walletRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/level', levelRoutes);
app.use('/api/achievements', studentAchievementRoutes);
app.use('/api/interactions', interactionRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/wordclouds', wordCloudRoutes);
app.use('/api/scales', scaleRoutes);
app.use('/api/store', storeRoutes);
const onboardingRoutes = require('./routes/onboardingRoutes');
app.use('/api/onboarding', onboardingRoutes);
const peopleRoutes = require('./routes/peopleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/people', peopleRoutes);
app.use('/api/notifications', notificationRoutes);
const pushRoutes = require('./routes/pushRoutes');
app.use('/api/push', pushRoutes);
const prideRoutes = require('./routes/prideRoutes');
app.use('/api/pride', prideRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Connect to MongoDB then start the server
connectDB().then(async () => {
  try {
    await require('./repositories/prideRepo').ensureIndexes();
  } catch (err) {
    log('warn', 'pride_indexes_failed', { msg: err.message });
  }
  app.listen(PORT, () => {
    log('info', 'listen', { port: Number(PORT) });
  });
}).catch(err => {
  log('error', 'mongo_connect_failed', { msg: err.message });
});
