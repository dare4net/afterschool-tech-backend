const notificationsRepo = require('../repositories/notificationsRepo');
const { inboxTypes, isPushServer } = require('./notificationCatalog');
const { dispatchPush } = require('./pushDispatch');
const { log } = require('./logger');

const NOTIFICATION_TYPES = inboxTypes();

async function notify(input) {
    try {
        if (!input || !input.userId || !input.type || !input.title) return null;
        if (!NOTIFICATION_TYPES.includes(input.type)) {
            log('warn', 'notify_unknown_type', { type: input.type });
            return null;
        }
        await notificationsRepo.ensureIndexes();
        const row = await notificationsRepo.insert({
            user_id: input.userId,
            type: input.type,
            actor_id: input.actorId || null,
            title: input.title,
            body: input.body || '',
            href: input.href || null,
            payload: input.payload || {},
        });
        if (isPushServer(input.type)) {
            dispatchPush({
                userId: input.userId,
                type: input.type,
                title: input.title,
                body: input.body || '',
                href: input.href || null,
            }).catch((err) => {
                log('warn', 'notify_push_failed', { msg: err.message, type: input.type });
            });
        }
        return row;
    } catch (err) {
        log('warn', 'notify_failed', { msg: err.message, type: input && input.type });
        return null;
    }
}

module.exports = {
    NOTIFICATION_TYPES,
    notify,
};
