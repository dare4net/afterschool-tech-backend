// server.js
const express = require('express');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const programRoutes = require('./routes/programRoutes');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Example test route
app.get('/', (req, res) => {
  res.send('After-school.tech backend running!');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/programs', programRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
