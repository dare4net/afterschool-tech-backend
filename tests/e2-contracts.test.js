const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PLATFORM_MISSIONS } = require('../helpers/platformMissions');
const {
    CONTRACT_KEYS,
    MISSION_IDS,
    PROGRESS_EVENT_TYPES,
    awardStarsBodySchema,
    spendStarsBodySchema,
    statsEventBodySchema,
    claimMissionBodySchema,
    interactionGetQuerySchema,
    interactionSaveBodySchema,
    validateBody,
    validateQuery,
} = require('../contracts/platform');

function mockRes() {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        return res;
    };
    return res;
}

describe('E2 platform contracts', () => {
    it('keeps mission IDs aligned with PLATFORM_MISSIONS', () => {
        assert.deepEqual(MISSION_IDS, PLATFORM_MISSIONS.map((m) => m.id));
        assert.deepEqual(PROGRESS_EVENT_TYPES, [
            'COMPONENT_RESET',
            'LESSON_REVIEWED',
            'COMPONENT_SUBMITTED',
            'LESSON_COMPLETED',
            'PROGRAM_ENROLLED',
            'STARS_AWARDED',
            'STARS_SPENT',
        ]);
    });

    it('exposes the shared field list', () => {
        assert.deepEqual(Object.keys(awardStarsBodySchema.shape), CONTRACT_KEYS.awardStars);
        assert.deepEqual(Object.keys(spendStarsBodySchema.shape), CONTRACT_KEYS.spendStars);
        assert.deepEqual(Object.keys(statsEventBodySchema.shape), CONTRACT_KEYS.statsEvent);
        assert.deepEqual(Object.keys(claimMissionBodySchema.shape), CONTRACT_KEYS.claimMission);
        assert.deepEqual(Object.keys(interactionGetQuerySchema.shape), CONTRACT_KEYS.interactionGet);
        assert.deepEqual(Object.keys(interactionSaveBodySchema.shape), CONTRACT_KEYS.interactionSave);
    });

    it('accepts valid wallet, stats, mission, and interaction payloads', () => {
        assert.equal(awardStarsBodySchema.parse({ amount: 5, reason: 'quiz', componentId: 'c1' }).amount, 5);
        assert.equal(spendStarsBodySchema.parse({ amount: 2, itemType: 'hint' }).amount, 2);
        assert.equal(statsEventBodySchema.parse({ eventType: 'COMPONENT_RESET' }).eventType, 'COMPONENT_RESET');
        assert.equal(claimMissionBodySchema.parse({ missionId: 'l1-enroll-program' }).missionId, 'l1-enroll-program');
        assert.equal(interactionGetQuerySchema.parse({ lessonId: 'lesson-1' }).lessonId, 'lesson-1');
        assert.equal(
            interactionSaveBodySchema.parse({
                lessonId: 'lesson-1',
                componentsState: { q1: { submitted: true } },
                lessonState: { lessonTitle: 'Test' },
                attemptsMap: { q1: { firstAttemptCount: 1, bestAttemptCount: 1 } },
            }).lessonId,
            'lesson-1'
        );
    });

    it('rejects invalid payloads', () => {
        assert.equal(awardStarsBodySchema.safeParse({ amount: 0 }).success, false);
        assert.equal(spendStarsBodySchema.safeParse({ amount: '3' }).success, false);
        assert.equal(statsEventBodySchema.safeParse({ eventType: 'UNKNOWN' }).success, false);
        assert.equal(claimMissionBodySchema.safeParse({ missionId: 'not a mission' }).success, false);
        assert.equal(claimMissionBodySchema.safeParse({ missionId: 'l3-custom-quest' }).success, true);
        assert.equal(interactionGetQuerySchema.safeParse({}).success, false);
        assert.equal(interactionSaveBodySchema.safeParse({ lessonId: '' }).success, false);
    });

    it('validateBody and validateQuery return 400 with details', () => {
        const req = { body: { amount: -1 } };
        const res = mockRes();
        let nextCalled = false;
        validateBody(awardStarsBodySchema)(req, res, () => { nextCalled = true; });
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'Validation failed');
        assert.equal(Array.isArray(res.body.details), true);
        assert.equal(nextCalled, false);

        const okReq = { body: { amount: 4, reason: 'ok' } };
        const okRes = mockRes();
        validateBody(awardStarsBodySchema)(okReq, okRes, () => { nextCalled = true; });
        assert.equal(okReq.validatedBody.amount, 4);
        assert.equal(nextCalled, true);

        const qRes = mockRes();
        let qNext = false;
        validateQuery(interactionGetQuerySchema)({ query: {} }, qRes, () => { qNext = true; });
        assert.equal(qRes.statusCode, 400);
        assert.equal(qNext, false);
    });

    it('wires Zod validators on wallet, stats, missions, and interactions routes', () => {
        const wallet = readFileSync(join(__dirname, '../routes/walletRoutes.js'), 'utf8');
        const stats = readFileSync(join(__dirname, '../routes/statsRoutes.js'), 'utf8');
        const missions = readFileSync(join(__dirname, '../routes/missionRoutes.js'), 'utf8');
        const interactions = readFileSync(join(__dirname, '../routes/interactionRoutes.js'), 'utf8');
        assert.match(wallet, /validateBody\(awardStarsBodySchema\)/);
        assert.match(wallet, /validateBody\(spendStarsBodySchema\)/);
        assert.match(stats, /validateBody\(statsEventBodySchema\)/);
        assert.match(missions, /validateBody\(claimMissionBodySchema\)/);
        assert.match(interactions, /validateQuery\(interactionGetQuerySchema\)/);
        assert.match(interactions, /validateBody\(interactionSaveBodySchema\)/);
    });
});
