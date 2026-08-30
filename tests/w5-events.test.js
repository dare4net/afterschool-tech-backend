const { describe, it } = require('node:test');
const assert = require('assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { matchesRules } = require('../helpers/catalogRules');
const { ACHIEVEMENT_EVENT_TYPES, ACHIEVEMENT_FIELDS_BY_EVENT } = require('../contracts/platform');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('W5 richer component events', () => {
    it('lets Superadmin match extras flattened onto the payload', () => {
        assert.equal(matchesRules({ type: 'hangman', wrongGuesses: 1 }, [
            { field: 'type', op: 'eq', value: 'hangman' },
            { field: 'wrongGuesses', op: 'lte', value: 2 },
        ]), true);
        assert.equal(matchesRules({ type: 'hangman', extras: { wrongGuesses: 4 }, wrongGuesses: 4 }, [
            { field: 'wrongGuesses', op: 'lte', value: 2 },
        ]), false);
        assert.ok(ACHIEVEMENT_FIELDS_BY_EVENT.COMPONENT_SUBMITTED.includes('wrongGuesses'));
        assert.ok(ACHIEVEMENT_FIELDS_BY_EVENT.COMPONENT_SUBMITTED.includes('memoryFlips'));
        assert.ok(ACHIEVEMENT_FIELDS_BY_EVENT.COMPONENT_SUBMITTED.includes('jigsawMoves'));
        assert.ok(ACHIEVEMENT_FIELDS_BY_EVENT.COMPONENT_SUBMITTED.includes('testsPassed'));
        assert.ok(ACHIEVEMENT_EVENT_TYPES.includes('AUDIO_REPLAYED'));
        assert.ok(ACHIEVEMENT_EVENT_TYPES.includes('HINT_USED'));
        assert.ok(ACHIEVEMENT_EVENT_TYPES.includes('POLL_VOTED'));
    });

    it('flattens extras in the achievement evaluator', () => {
        const source = read('controllers/achievementController.js');
        assert.match(source, /payload\.extras/);
        assert.match(source, /const flat = \{ \.\.\.payload, \.\.\.extras \}/);
    });

    it('stores one scale rating per user and exposes class averages', () => {
        const repo = read('repositories/liveAggregatesRepo.js');
        assert.match(repo, /ratings\.\$\{safeUser\}/);
        assert.match(repo, /function scaleSnapshot/);
        const server = read('server.js');
        assert.match(server, /app\.use\('\/api\/scales',\s*scaleRoutes\)/);
    });
});
