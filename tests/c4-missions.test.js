const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PLATFORM_MISSIONS, getMissionById, isMissionEarned } = require('../helpers/platformMissions');

describe('C4 platform missions', () => {
    it('defines the shared mission ID contract', () => {
        assert.deepEqual(PLATFORM_MISSIONS.map((m) => m.id), [
            'l1-enroll-program',
            'l1-earn-stars',
            'l1-reset-component',
            'l2-spend-stars',
            'l2-streak-3',
            'l2-review-lesson',
        ]);
        assert.equal(getMissionById('l1-enroll-program').rewardStars, 3);
        assert.equal(isMissionEarned(getMissionById('l1-reset-component'), { componentsReset: 0 }), false);
        assert.equal(isMissionEarned(getMissionById('l1-reset-component'), { componentsReset: 1 }), true);
    });
});

describe('C4 mission and level routes', () => {
    it('mounts authorized claim and level-up endpoints', () => {
        const server = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');
        assert.match(server, /app\.use\('\/api\/missions'/);
        assert.match(server, /app\.use\('\/api\/level'/);

        const missions = readFileSync(join(__dirname, '..', 'routes/missionRoutes.js'), 'utf8');
        const level = readFileSync(join(__dirname, '..', 'routes/levelRoutes.js'), 'utf8');
        assert.match(missions, /router\.use\(authorize\)/);
        assert.match(missions, /router\.get\('\/catalog'/);
        assert.match(missions, /router\.post\('\/claim'/);
        assert.match(level, /router\.use\(authorize\)/);
        assert.match(level, /router\.post\('\/up'/);
    });

    it('stats summary exposes persisted level and mission fields', () => {
        const source = readFileSync(join(__dirname, '..', 'controllers/statsController.js'), 'utf8');
        assert.match(source, /completedMissions/);
        assert.match(source, /componentsReset/);
        assert.match(source, /consecutiveCorrect/);
        assert.match(source, /lessonsReviewed/);
        assert.match(source, /lifetimeStarsEarned/);
        assert.match(source, /submitsByType/);
        assert.match(source, /submitsByLesson/);
        assert.match(source, /submitsByComponent/);
        assert.match(source, /componentId/);
        assert.equal(source.includes('req.query.userId'), false);
    });
});
