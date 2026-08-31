const { getAuthenticatedUserId } = require('../helpers/actorUser');
const usersRepo = require('../repositories/usersRepo');
const { isPushConfigured } = require('../helpers/pushDispatch');

exports.registerToken = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = req.validatedBody && req.validatedBody.token;
        const tokens = await usersRepo.addFcmToken(userId, token);
        return res.json({
            success: true,
            stored: tokens.length,
            pushConfigured: isPushConfigured(),
        });
    } catch (err) {
        console.error('[PUSH] Register token failed:', err);
        return res.status(500).json({ error: 'Failed to save push token' });
    }
};

exports.removeToken = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = req.validatedBody && req.validatedBody.token;
        const tokens = await usersRepo.removeFcmToken(userId, token);
        return res.json({ success: true, stored: tokens.length });
    } catch (err) {
        console.error('[PUSH] Remove token failed:', err);
        return res.status(500).json({ error: 'Failed to remove push token' });
    }
};
