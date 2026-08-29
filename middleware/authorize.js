const jwt = require('jsonwebtoken');
const database = require('../config/database');

/**
 * Load the user from Mongo and attach a canonical req.user ({ user_id, role, ... }).
 * Used by every authenticated router — do not set req.user from the JWT payload alone.
 */
const authorize = async (req, res, next) => {
    try {
        if (!process.env.JWT_SECRET) {
            console.error('Auth Error: JWT_SECRET is not set');
            return res.status(500).json({ message: 'Internal server error' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.user_id) {
            return res.status(401).json({ message: 'Invalid token' });
        }

        const db = await database.getMainDb();
        const user = await db.collection('users').findOne(
            { user_id: decoded.user_id },
            { projection: { password_hash: 0 } }
        );

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        req.user = {
            _id: user._id,
            user_id: user.user_id,
            email: user.email,
            role: user.account_type,
            full_name: user.full_name,
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

const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: 'You do not have permission to perform this action',
            });
        }

        next();
    };
};

module.exports = { authorize, authorizeRole };
