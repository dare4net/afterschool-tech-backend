const defaultUsersRepo = require('../repositories/usersRepo');
const { log } = require('./logger');

const DEFAULT_APP_ORIGIN = 'https://app.after-school.tech';
const DEAD_TOKEN = /registration-token-not-registered|invalid-registration-token|invalid-argument/i;

function parseServiceAccount(raw = process.env.FIREBASE_SERVICE_ACCOUNT) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.private_key) return null;
        return parsed;
    } catch {
        return null;
    }
}

function isPushConfigured() {
    return Boolean(parseServiceAccount() || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

function appOrigin() {
    const raw = String(process.env.PUBLIC_APP_URL || DEFAULT_APP_ORIGIN).replace(/\/$/, '');
    return raw || DEFAULT_APP_ORIGIN;
}

function absoluteHref(href) {
    const path = String(href || '/dashboard/student');
    if (/^https?:\/\//i.test(path)) return path;
    return `${appOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

function getMessaging() {
    if (!isPushConfigured()) return null;
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
        const cred = parseServiceAccount();
        if (cred) {
            admin.initializeApp({ credential: admin.credential.cert(cred) });
        } else {
            admin.initializeApp();
        }
    }
    return admin.messaging();
}

async function defaultSend(message) {
    const messaging = getMessaging();
    if (!messaging) return { delivered: false, reason: 'push_unconfigured' };
    const result = await messaging.sendEachForMulticast(message);
    return result;
}

function createPushDispatch({
    listTokens = defaultUsersRepo.listFcmTokens,
    dropToken = defaultUsersRepo.removeFcmToken,
    sendMulticast = defaultSend,
} = {}) {
    async function dispatchPush(input) {
        if (!input || !input.userId || !input.title) {
            return { delivered: false, reason: 'invalid' };
        }
        if (!isPushConfigured()) {
            return { delivered: false, reason: 'push_unconfigured' };
        }
        const tokens = await listTokens(input.userId);
        if (!tokens.length) {
            return { delivered: false, reason: 'no_token' };
        }
        const href = absoluteHref(input.href);
        const payload = {
            tokens,
            notification: {
                title: String(input.title).slice(0, 120),
                body: String(input.body || '').slice(0, 240),
            },
            data: {
                type: String(input.type || ''),
                href,
            },
            webpush: {
                fcmOptions: { link: href },
                notification: {
                    title: String(input.title).slice(0, 120),
                    body: String(input.body || '').slice(0, 240),
                    icon: `${appOrigin()}/icons/icon-192x192.png`,
                },
            },
        };
        try {
            const result = await sendMulticast(payload);
            if (result && result.delivered === false) return result;
            const responses = result && Array.isArray(result.responses) ? result.responses : [];
            let delivered = 0;
            await Promise.all(responses.map(async (row, index) => {
                if (row && row.success) {
                    delivered += 1;
                    return;
                }
                const code = row && row.error && (row.error.code || row.error.message);
                if (code && DEAD_TOKEN.test(String(code))) {
                    await dropToken(input.userId, tokens[index]);
                }
            }));
            return {
                delivered: delivered > 0,
                reason: delivered > 0 ? 'ok' : 'send_failed',
                successCount: delivered,
                failureCount: Math.max(0, tokens.length - delivered),
            };
        } catch (err) {
            log('warn', 'push_send_failed', { msg: err.message, type: input.type });
            return { delivered: false, reason: 'send_failed' };
        }
    }

    return { dispatchPush };
}

const defaults = createPushDispatch();

module.exports = {
    DEFAULT_APP_ORIGIN,
    parseServiceAccount,
    isPushConfigured,
    absoluteHref,
    createPushDispatch,
    dispatchPush: defaults.dispatchPush,
};
