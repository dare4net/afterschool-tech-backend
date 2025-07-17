const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const db = client.db('afterschooltech');

const authorize = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Get user from database
    const user = await db.collection('users').findOne(
      { user_id: decoded.user_id },
      { projection: { password_hash: 0 } } // Exclude password hash
    );

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Add user info to request object
    req.user = {
      _id: user._id,
      user_id: user.user_id,
      email: user.email,
      role: user.account_type,
      full_name: user.full_name
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    console.error('Auth Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Role-based authorization middleware creator
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'You do not have permission to perform this action' 
      });
    }

    next();
  };
};

module.exports = { authorize, authorizeRole };
