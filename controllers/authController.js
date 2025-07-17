const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const generateUserId = require('../utils/generateUserId');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const db = client.db('afterschooltech');

// Google OAuth2 client
// const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.signup = async (req, res) => {
  console.log('we are registering...');
  const { email, password, role, full_name } = req.body;
  try {
    // Check if user exists
    const existing = await db.collection('users').findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user_id = await generateUserId(); // Generate a unique 5-digit user_id

    // Create user document
    const userDoc = {
      user_id,
      email,
      password_hash: hashedPassword,
      account_type: role,
      full_name: full_name || null,
      created_at: new Date()
    };

    // Insert user document
    await db.collection('users').insertOne(userDoc);

    // Create role-specific document
    const roleDoc = {
      user_id,
      email,
      full_name: full_name || '',
      created_at: new Date()
    };

    // Insert into role-specific collection
    const collection = `${role}s`; // students, parents, organizations, tutors
    await db.collection(collection).insertOne(roleDoc);

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
    const user = await db.collection('users').findOne({ email });
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
    console.error('MongoDB Error:', err);
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
    let user = await db.collection('users').findOne({ email });
    
    if (!user) {
      const userDoc = {
        email,
        account_type: 'user',
        full_name: fbRes.data.name,
        facebook_id: userID,
        created_at: new Date()
      };
      const result = await db.collection('users').insertOne(userDoc);
      user = { _id: result.insertedId, ...userDoc };
    }

    const jwtToken = jwt.sign(
      { user_id: user._id.toString(), role: user.account_type },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token: jwtToken });
  } catch (err) {
    console.error('MongoDB Error:', err);
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
    let user = await db.collection('users').findOne({ email });
    
    if (!user) {
      const userDoc = {
        email,
        account_type: 'user',
        apple_sub: decoded.payload.sub,
        created_at: new Date()
      };
      const result = await db.collection('users').insertOne(userDoc);
      user = { _id: result.insertedId, ...userDoc };
    }

    const jwtToken = jwt.sign(
      { user_id: user._id.toString(), role: user.account_type },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token: jwtToken });
  } catch (err) {
    console.error('MongoDB Error:', err);
    res.status(401).json({ error: 'Invalid Apple token' });
  }
};
