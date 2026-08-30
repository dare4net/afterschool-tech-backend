const bcrypt = require('bcrypt');
const axios = require('axios');
const { getMainDb } = require('../config/database');
const generateUserId = require('../utils/generateUserId');
const { verifyAppleIdToken } = require('../helpers/appleIdToken');
const { issueAuthToken, findOrCreateSocialUser } = require('../helpers/authIdentity');

// Google OAuth2 client
// const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.signup = async (req, res) => {
  console.log('we are registering...');
  const { email, password, role, full_name } = req.body;
  try {
    const db = await getMainDb();
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

    const token = issueAuthToken({ user_id, account_type: role });

    res.status(201).json({
      message: 'User registered',
      token,
      user: {
        user_id,
        email,
        full_name: full_name || null,
        handle: null,
        isPublicProfile: false,
        accentColor: null,
        avatarId: null,
        onboardingCompletedAt: null,
        onboardingSkippedAt: null,
      },
    });
  } catch (err) {
    console.error('SQL Error:', err); // Log SQL errors
    res.status(500).json({ error: err.message });
  }
};

// REMOVED: Dead MySQL register function - use signup instead

exports.login = async (req, res) => {
  console.log('we are logging in...');
  const { email, password } = req.body;
  try {
    const db = await getMainDb();
    const user = await db.collection('users').findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Use password_hash for bcrypt comparison
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = issueAuthToken(user);
    res.json({
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name || null,
        handle: user.handle || null,
        isPublicProfile: user.isPublicProfile === true,
        accentColor: user.accentColor || null,
        avatarId: user.avatarId || null,
        onboardingCompletedAt: user.onboardingCompletedAt || null,
        onboardingSkippedAt: user.onboardingSkippedAt || null,
      },
    });
  } catch (err) {
    console.error('MongoDB Error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Social Login: Google
exports.googleLogin = async (req, res) => {
  res.status(501).json({ message: 'Google login is temporarily unavailable' });
};

function socialError(res, err, fallbackMessage) {
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(fallbackMessage, err.message);
  return res.status(401).json({ error: fallbackMessage });
}

// Social Login: Facebook
exports.facebookLogin = async (req, res) => {
  const { accessToken, userID } = req.body;
  try {
    if (!accessToken) {
      return res.status(400).json({ error: 'Facebook access token is required' });
    }
    const db = await getMainDb();
    const fbUrl = `https://graph.facebook.com/v12.0/${encodeURIComponent(userID || 'me')}?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`;
    const fbRes = await axios.get(fbUrl);
    const email = fbRes.data.email;
    const facebook_id = fbRes.data.id || userID;
    if (!email) return res.status(400).json({ error: 'Facebook account has no email' });

    const user = await findOrCreateSocialUser(db, {
      email,
      full_name: fbRes.data.name,
      facebook_id,
    });
    res.json({ token: issueAuthToken(user) });
  } catch (err) {
    socialError(res, err, 'Invalid Facebook token');
  }
};

// Social Login: Apple
exports.appleLogin = async (req, res) => {
  const { idToken } = req.body;
  try {
    const db = await getMainDb();
    const payload = await verifyAppleIdToken(idToken);
    const user = await findOrCreateSocialUser(db, {
      email: payload.email,
      apple_sub: payload.sub,
    });
    res.json({ token: issueAuthToken(user) });
  } catch (err) {
    socialError(res, err, 'Invalid Apple token');
  }
};
