const { credentialsMatch, signSuperadminToken, getCredentials } = require('../helpers/superadminAuth');

exports.login = async (req, res) => {
    try {
        const username = typeof req.body?.username === 'string' ? req.body.username : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const result = credentialsMatch(username, password);
        if (!result.configured) {
            return res.status(503).json({ error: 'Superadmin is not configured' });
        }
        if (!result.ok) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = signSuperadminToken();
        return res.json({ success: true, token, username: getCredentials().username });
    } catch (err) {
        console.error('[SUPERADMIN] Login failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.me = async (req, res) => {
    res.json({
        success: true,
        username: req.superadmin.username,
        role: 'superadmin',
    });
};
