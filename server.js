// server.js
const express = require('express');
require('dotenv').config();
const cors = require('cors');
const { connectDB } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const programRoutes = require('./routes/programRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const betaRoutes = require('./routes/betaRoutes');
const studioRoutes = require('./routes/studioRoutes');
const temporaryAccessMiddleware = require('./middleware/temporaryAccess');


const app = express();
app.use(express.json());

// Add CORS middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://v0-afterschool-tech.vercel.app',
    'https://v0-afterschool-tech-git-beta-chatzteam-gmailcoms-projects.vercel.app',
    'https://app.after-school.tech'
  ],
  credentials: true,
}));

const PORT = process.env.PORT || 5001;

// Example test route
app.get('/', (req, res) => {
  res.send('After-school.tech backend running!');
});

// Remove old MongoDB test route - connection handled by centralized module

// Add temporary access middleware only for auth routes
// app.use('/api/auth', temporaryAccessMiddleware);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/beta', betaRoutes);
app.use('/api/studio', studioRoutes);  // Studio routes for lesson builder

// Connect to MongoDB then start the server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
});
