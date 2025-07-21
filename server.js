// server.js
const express = require('express');
require('dotenv').config();
const cors = require('cors');
const { MongoClient } = require('mongodb');
const authRoutes = require('./routes/authRoutes');
const programRoutes = require('./routes/programRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const betaRoutes = require('./routes/betaRoutes');

// MongoDB Connection Setup
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

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

const PORT = process.env.PORT || 3000;

// Example test route
app.get('/', (req, res) => {
  res.send('After-school.tech backend running!');
});

// MongoDB connection test route
app.get('/api/test-db', async (req, res) => {
  try {
    // Test the connection by running a simple command
    await client.db('afterschooltech').command({ ping: 1 });
    res.json({ 
      status: 'success', 
      message: 'MongoDB connection successful',
      database: 'afterschooltech'
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      message: 'MongoDB connection failed', 
      error: err.message 
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/beta', betaRoutes);

// Connect to MongoDB then start the server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
});
