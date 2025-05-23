// server.js
const express = require('express');
//const cors = require('cors');
require('dotenv').config();
const cors = require('cors'); // <-- add this line
const authRoutes = require('./routes/authRoutes');
const programRoutes = require('./routes/programRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
app.use(express.json());

// Add CORS middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://v0-afterschool-tech.vercel.app'
  ],
  credentials: true,
}));

const PORT = process.env.PORT || 3000;

// Example test route
app.get('/', (req, res) => {
  res.send('After-school.tech backend running!');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
