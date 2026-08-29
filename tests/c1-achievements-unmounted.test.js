const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getAchievementIds } = require('../helpers/platformAchievements');

describe('C1 broken MySQL achievements router stays unmounted', () => {
    it('server.js does not mount routes/achievements (missing models/models)', () => {
        const source = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');
        assert.equal(source.includes("require('./routes/achievements')"), false);
        assert.equal(existsSync(join(__dirname, '../routes/achievements.js')), false);
        assert.match(source, /app\.use\('\/api\/wallet'/);
    });
});

describe('D6 clean achievements API', () => {
    it('mounts JWT-authorized student and evaluate routes', () => {
        const server = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');
        assert.match(server, /require\('\.\/routes\/studentAchievements'\)/);
        assert.match(server, /app\.use\('\/api\/achievements',\s*studentAchievementRoutes\)/);

        const routes = readFileSync(join(__dirname, '../routes/studentAchievements.js'), 'utf8');
        assert.match(routes, /router\.use\(authorize\)/);
        assert.match(routes, /router\.get\('\/student'/);
        assert.match(routes, /router\.post\('\/evaluate'/);
        assert.equal(routes.includes('../models/models'), false);
    });

    it('controller identity comes from JWT, not query/body userId', () => {
        const source = readFileSync(join(__dirname, '../controllers/achievementController.js'), 'utf8');
        assert.match(source, /getAuthenticatedUserId/);
        assert.equal(source.includes('req.query.userId'), false);
        assert.equal(source.includes('req.body.userId'), false);
        assert.equal(source.includes('req.user?.id'), false);
    });

    it('exports the shared achievement ID contract', () => {
        assert.deepEqual(getAchievementIds(), [
            'grid-memory-master',
            'first-live-star',
            'speed-demon',
            'perfect-lesson',
        ]);
    });
});
