const { verifySuperadminToken } = require('../helpers/superadminAuth');

function requireSuperadmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const decoded = verifySuperadminToken(authHeader.split(' ')[1]);
    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.superadmin = {
        username: decoded.username,
        role: 'superadmin',
    };
    next();
}

module.exports = { requireSuperadmin };
