const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { mergeComponentsState } = require('../helpers/interactionMerge');

describe('mergeComponentsState', () => {
    it('keeps tutor-marked scores when the student saves later', () => {
        const merged = mergeComponentsState(
            { c1: { isSubmitted: true, score: 0 } },
            { c1: { tutorMarked: true, score: 8, isApproved: true, markedBy: 'tutor-1', markedAt: 'now' } }
        );
        assert.equal(merged.c1.tutorMarked, true);
        assert.equal(merged.c1.score, 8);
        assert.equal(merged.c1.isApproved, true);
        assert.equal(merged.c1.isSubmitted, true);
    });

    it('keeps a studio reset until the student submits again', () => {
        const merged = mergeComponentsState(
            { c1: { isSubmitted: false } },
            { c1: { wasReset: true, score: 0 } }
        );
        assert.equal(merged.c1.wasReset, true);
    });
});

describe('E1 Express interactions API', () => {
    it('mounts authorized GET and POST /api/interactions', () => {
        const server = readFileSync(join(__dirname, '../server.js'), 'utf8');
        assert.match(server, /app\.use\('\/api\/interactions',\s*interactionRoutes\)/);
        const routes = readFileSync(join(__dirname, '../routes/interactionRoutes.js'), 'utf8');
        assert.match(routes, /router\.use\(authorize\)/);
        assert.match(routes, /router\.get\('\/'/);
        assert.match(routes, /router\.post\('\/'/);
    });
});
