const notificationsRepo = require('../repositories/notificationsRepo');
const { log } = require('./logger');

const NOTIFICATION_TYPES = [
    'ACHIEVEMENT_EARNED',
    'MISSION_CLAIMED',
    'LEVEL_UP',
    'FOLLOWED_YOU',
    'CROWN_GOLD',
    'PROGRAM_LESSON_PUBLISHED',
    'PROGRAM_MODULE_PUBLISHED',
    'TUTOR_MARKED',
];

async function notify(input) {
    try {
        if (!input || !input.userId || !input.type || !input.title) return null;
        if (!NOTIFICATION_TYPES.includes(input.type)) {
            log('warn', 'notify_unknown_type', { type: input.type });
            return null;
        }
        await notificationsRepo.ensureIndexes();
        return await notificationsRepo.insert({
            user_id: input.userId,
            type: input.type,
            actor_id: input.actorId || null,
            title: input.title,
            body: input.body || '',
            href: input.href || null,
            payload: input.payload || {},
        });
    } catch (err) {
        log('warn', 'notify_failed', { msg: err.message, type: input && input.type });
        return null;
    }
}

module.exports = {
    NOTIFICATION_TYPES,
    notify,
};
