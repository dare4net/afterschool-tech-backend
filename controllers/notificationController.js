const { getAuthenticatedUserId } = require('../helpers/actorUser');
const notificationsRepo = require('../repositories/notificationsRepo');

exports.list = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        await notificationsRepo.ensureIndexes();
        const unreadOnly = req.query?.unread === 'true';
        const limit = req.query?.limit;
        const notifications = await notificationsRepo.listByUser(userId, { limit, unreadOnly });
        const unreadCount = await notificationsRepo.countUnread(userId);
        res.json({ success: true, notifications, unreadCount });
    } catch (err) {
        console.error('[NOTIFICATIONS] Error listing inbox:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.unreadCount = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        await notificationsRepo.ensureIndexes();
        const unreadCount = await notificationsRepo.countUnread(userId);
        res.json({ success: true, unreadCount });
    } catch (err) {
        console.error('[NOTIFICATIONS] Error counting unread:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.markRead = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { ids, all } = req.validatedBody || {};
        await notificationsRepo.ensureIndexes();
        const modified = all === true
            ? await notificationsRepo.markAllRead(userId)
            : await notificationsRepo.markRead(userId, ids);
        const unreadCount = await notificationsRepo.countUnread(userId);
        res.json({ success: true, modified, unreadCount });
    } catch (err) {
        console.error('[NOTIFICATIONS] Error marking read:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
