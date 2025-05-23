const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
// const { OAuth2Client } = require('google-auth-library'); // Removed import
const axios = require('axios');
const generateUserId = require('../utils/generateUserId'); // <-- import generator

// Google OAuth2 client
// const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.signup = async (req, res) => {
  console.log('we are registering...');
  const { email, password, role, full_name } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user_id = await generateUserId(pool); // <-- generate unique 5-digit user_id

    // Insert into users table
    const [result] = await pool.query(
      'INSERT INTO users (user_id, email, password_hash, account_type, full_name) VALUES (?, ?, ?, ?, ?)',
      [user_id, email, hashedPassword, role, full_name || null]
    );

    // Insert into subtype table based on role
    if (role === 'student') {
      await pool.query(
        'INSERT INTO students (user_id, email, full_name) VALUES (?, ?, ?)',
        [user_id, email, full_name || '']
      );
    } else if (role === 'parent') {
      await pool.query(
        'INSERT INTO parents (user_id, email, full_name) VALUES (?, ?, ?)',
        [user_id, email, full_name || '']
      );
    } else if (role === 'organization') {
      await pool.query(
        'INSERT INTO organizations (user_id, email, full_name) VALUES (?, ?, ?)',
        [user_id, email, full_name || '']
      );
    } else if (role === 'tutor') {
      await pool.query(
        'INSERT INTO tutors (user_id, full_name) VALUES (?, ?)',
        [user_id, full_name || '']
      );
    }

    // Automatic login after registration
    const token = jwt.sign(
      { user_id, role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ message: 'User registered', token });
  } catch (err) {
    console.error('SQL Error:', err); // Log SQL errors
    res.status(500).json({ error: err.message });
  }
};

// Registration endpoint (no password, for social/open registration)
exports.register = async (req, res) => {
  const { email, role = 'user' } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(400).json({ message: 'User already exists' });

    await pool.query('INSERT INTO users (email, account_type) VALUES (?, ?)', [
      email, role
    ]);
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    console.error('SQL Error:', err); // Log SQL errors
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  console.log('we are logging in...');
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Use password_hash for bcrypt comparison
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    // Use user_id and account_type for JWT, to match signup
    const token = jwt.sign(
      { user_id: user.user_id, role: user.account_type },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token });
  } catch (err) {
    console.error('SQL Error:', err); // Log SQL errors
    res.status(500).json({ error: err.message });
  }
};

// Social Login: Google
exports.googleLogin = async (req, res) => {
  res.status(501).json({ message: 'Google login is temporarily unavailable' });
};

// Social Login: Facebook
exports.facebookLogin = async (req, res) => {
  const { accessToken, userID } = req.body;
  try {
    // Verify token and get user info
    const fbUrl = `https://graph.facebook.com/v12.0/${userID}?fields=id,name,email&access_token=${accessToken}`;
    const fbRes = await axios.get(fbUrl);
    const email = fbRes.data.email;
    if (!email) return res.status(400).json({ error: 'Facebook account has no email' });
    // Check if user exists
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    let user;
    if (existing.length) {
      user = existing[0];
    } else {
      const [result] = await pool.query(
        'INSERT INTO users (email, account_type) VALUES (?, ?)',
        [email, 'user']
      );
      user = { id: result.insertId, email, account_type: 'user' };
    }
    const jwtToken = jwt.sign({ id: user.id, role: user.account_type }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token: jwtToken });
  } catch (err) {
    console.error('SQL Error:', err); // Log SQL errors
    res.status(401).json({ error: 'Invalid Facebook token' });
  }
};

// Social Login: Apple
exports.appleLogin = async (req, res) => {
  const { idToken } = req.body;
  try {
    // Apple ID token is a JWT, decode it
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.payload || !decoded.payload.email) {
      return res.status(400).json({ error: 'Invalid Apple token' });
    }
    const email = decoded.payload.email;
    // Check if user exists
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    let user;
    if (existing.length) {
      user = existing[0];
    } else {
      const [result] = await pool.query(
        'INSERT INTO users (email, account_type) VALUES (?, ?)',
        [email, 'user']
      );
      user = { id: result.insertId, email, account_type: 'user' };
    }
    const jwtToken = jwt.sign({ id: user.id, role: user.account_type }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token: jwtToken });
  } catch (err) {
    console.error('SQL Error:', err); // Log SQL errors
    res.status(401).json({ error: 'Invalid Apple token' });
  }
};
