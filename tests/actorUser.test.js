const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getAuthenticatedUserId, resolveLessonViewerUserId, resolveInteractionUserId } = require('../helpers/actorUser');

describe('getAuthenticatedUserId', () => {
    it('reads user_id from the JWT-backed req.user', () => {
        assert.equal(getAuthenticatedUserId({ user: { user_id: 'alice' } }), 'alice');
    });

    it('falls back to req.user.id if that is how the token was shaped', () => {
        assert.equal(getAuthenticatedUserId({ user: { id: 'alice' } }), 'alice');
    });

    it('ignores query and body userId (IDOR bypass)', () => {
        const req = {
            query: { userId: 'victim' },
            body: { userId: 'victim' },
        };
        assert.equal(getAuthenticatedUserId(req), null);
    });

    it('prefers the authenticated user over a spoofed body userId', () => {
        const req = {
            user: { user_id: 'alice' },
            query: { userId: 'victim' },
            body: { userId: 'victim' },
        };
        assert.equal(getAuthenticatedUserId(req), 'alice');
    });
});

describe('resolveLessonViewerUserId', () => {
    it('uses the JWT user for students even if query userId is spoofed', () => {
        const req = { user: { user_id: 'alice', role: 'student' }, query: { userId: 'victim' } };
        assert.equal(resolveLessonViewerUserId(req), 'alice');
    });

    it('lets tutors request a student userId', () => {
        const req = { user: { user_id: 'tutor-1', role: 'tutor' }, query: { userId: 'student-9' } };
        assert.equal(resolveLessonViewerUserId(req), 'student-9');
    });
});

describe('resolveInteractionUserId', () => {

    it('forces students onto their own user id', () => {
        const result = resolveInteractionUserId({ user: { user_id: 'alice', role: 'student' }, query: {}, body: {} });
        assert.deepEqual(result, { userId: 'alice' });
    });

    it('rejects a student requesting another user', () => {
        const result = resolveInteractionUserId({
            user: { user_id: 'alice', role: 'student' },
            query: { userId: 'victim' },
            body: {},
        });
        assert.equal(result.status, 403);
    });

    it('lets tutors inspect a requested student', () => {
        const result = resolveInteractionUserId({
            user: { user_id: 'tutor-1', role: 'tutor' },
            body: { userId: 'student-9' },
            query: {},
        });
        assert.deepEqual(result, { userId: 'student-9' });
    });
});

describe('wallet/stats/leaderboard identity sources', () => {
    const files = [
        'controllers/walletController.js',
        'controllers/statsController.js',
        'controllers/leaderboardController.js',
        'routes/walletRoutes.js',
        'routes/statsRoutes.js',
        'routes/leaderboardRoutes.js',
        'routes/missionRoutes.js',
        'routes/levelRoutes.js',
        'controllers/missionController.js',
    ];

    it('does not read req.query.userId or req.body.userId', () => {
        for (const file of files) {
            const source = readFileSync(join(__dirname, '..', file), 'utf8');
            assert.equal(source.includes('req.query.userId'), false, file);
            assert.equal(source.includes('req.body.userId'), false, file);
        }
    });

    it('mounts authorize on wallet, stats, and personal leaderboard', () => {
        const wallet = readFileSync(join(__dirname, '../routes/walletRoutes.js'), 'utf8');
        const stats = readFileSync(join(__dirname, '../routes/statsRoutes.js'), 'utf8');
        const board = readFileSync(join(__dirname, '../routes/leaderboardRoutes.js'), 'utf8');
        assert.match(wallet, /router\.use\(authorize\)/);
        assert.match(stats, /router\.use\(authorize\)/);
        assert.match(board, /\/personal',\s*authorize/);
    });
});
