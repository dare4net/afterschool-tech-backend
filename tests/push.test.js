const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
    parseServiceAccount,
    isPushConfigured,
    absoluteHref,
    createPushDispatch,
} = require('../helpers/pushDispatch');
const { pushTokenBodySchema } = require('../contracts/platform');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('FCM push dispatch', () => {
    it('treats a service-account JSON env as configured', () => {
        assert.equal(parseServiceAccount('not-json'), null);
        assert.equal(parseServiceAccount('{"project_id":"x"}'), null);
        const cred = parseServiceAccount(JSON.stringify({
            project_id: 'ast',
            client_email: 'fcm@ast.iam.gserviceaccount.com',
            private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
        }));
        assert.equal(cred.project_id, 'ast');
        const previousAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
        const previousGoogle = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        delete process.env.FIREBASE_SERVICE_ACCOUNT;
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        try {
            assert.equal(isPushConfigured(), false);
        } finally {
            if (previousAccount === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
            else process.env.FIREBASE_SERVICE_ACCOUNT = previousAccount;
            if (previousGoogle === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
            else process.env.GOOGLE_APPLICATION_CREDENTIALS = previousGoogle;
        }
        assert.match(absoluteHref('/dashboard/student/streak'), /\/dashboard\/student\/streak$/);
    });

    it('sends to stored tokens and drops dead ones', async () => {
        const dropped = [];
        const { dispatchPush } = createPushDispatch({
            async listTokens() {
                return ['live-token', 'dead-token'];
            },
            async dropToken(userId, token) {
                dropped.push({ userId, token });
            },
            async sendMulticast() {
                return {
                    responses: [
                        { success: true },
                        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
                    ],
                };
            },
        });
        const previous = process.env.FIREBASE_SERVICE_ACCOUNT;
        process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
            project_id: 'ast',
            private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
        });
        try {
            const result = await dispatchPush({
                userId: 's1',
                type: 'STREAK_REMINDER',
                title: "Don't lose your streak",
                body: 'Open a lesson today.',
                href: '/dashboard/student/streak',
            });
            assert.equal(result.delivered, true);
            assert.equal(result.successCount, 1);
            assert.equal(dropped[0].token, 'dead-token');
        } finally {
            if (previous === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
            else process.env.FIREBASE_SERVICE_ACCOUNT = previous;
        }
    });

    it('mounts authorized token register and documents env', () => {
        assert.equal(pushTokenBodySchema.safeParse({ token: 'short' }).success, false);
        assert.equal(pushTokenBodySchema.safeParse({ token: 'x'.repeat(40) }).success, true);
        const server = read('server.js');
        assert.match(server, /app\.use\('\/api\/push',\s*pushRoutes\)/);
        const routes = read('routes/pushRoutes.js');
        assert.match(routes, /router\.use\(authorize\)/);
        assert.match(routes, /\/tokens/);
        assert.match(read('.env.example'), /FIREBASE_SERVICE_ACCOUNT=/);
        assert.match(read('controllers/pushController.js'), /addFcmToken/);
        assert.equal(read('controllers/pushController.js').includes('getMainDb'), false);
    });
});
