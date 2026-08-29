const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { decideWrite, currentVersion } = require('../helpers/optimisticVersion');

function memoryDocs() {
    const rows = new Map();
    return {
        save(key, payload) {
            const existing = rows.get(key) || null;
            const decision = decideWrite(existing, payload.version);
            if (decision.action === 'conflict') {
                return { conflict: true, version: decision.version };
            }
            const next = { ...payload, version: decision.version };
            rows.set(key, next);
            return { ok: true, version: decision.version, doc: next };
        },
        get(key) {
            return rows.get(key);
        },
    };
}

describe('G3 optimistic version', () => {
    it('treats a missing document as version 0 and inserts as 1', () => {
        assert.equal(currentVersion(null), 0);
        assert.deepEqual(decideWrite(null, 0), { action: 'insert', version: 1 });
        assert.deepEqual(decideWrite(null, undefined), { action: 'insert', version: 1 });
    });

    it('rejects a stale client version', () => {
        assert.deepEqual(decideWrite({ version: 2 }, 1), { action: 'conflict', version: 2 });
        assert.deepEqual(decideWrite({ version: 2 }, 0), { action: 'conflict', version: 2 });
    });

    it('increments on a matching version', () => {
        assert.deepEqual(decideWrite({ version: 2 }, 2), { action: 'update', version: 3 });
        assert.deepEqual(decideWrite({}, 0), { action: 'update', version: 1 });
    });
});

describe('G3 two writers do not last-write-win', () => {
    it('keeps the first save and 409s the second at the same version', () => {
        const docs = memoryDocs();
        const first = docs.save('user-1:lesson-1', { componentsState: { a: 1 }, version: 0 });
        const second = docs.save('user-1:lesson-1', { componentsState: { b: 2 }, version: 0 });
        assert.equal(first.ok, true);
        assert.equal(first.version, 1);
        assert.equal(second.conflict, true);
        assert.equal(second.version, 1);
        assert.deepEqual(docs.get('user-1:lesson-1').componentsState, { a: 1 });
    });

    it('lets the loser retry after reloading the winner version', () => {
        const docs = memoryDocs();
        docs.save('user-1:lesson-1', { componentsState: { a: 1 }, version: 0 });
        const lost = docs.save('user-1:lesson-1', { componentsState: { b: 2 }, version: 0 });
        const retried = docs.save('user-1:lesson-1', { componentsState: { b: 2 }, version: lost.version });
        assert.equal(retried.ok, true);
        assert.equal(retried.version, 2);
        assert.deepEqual(docs.get('user-1:lesson-1').componentsState, { b: 2 });
    });
});

describe('G3 wiring', () => {
    it('interactions POST returns 409 on version conflict and stores version', () => {
        const controller = readFileSync(join(__dirname, '../controllers/interactionController.js'), 'utf8');
        const repo = readFileSync(join(__dirname, '../repositories/interactionsRepo.js'), 'utf8');
        assert.match(controller, /status\(409\)/);
        assert.match(controller, /Version conflict/);
        assert.match(controller, /version: result\.version/);
        assert.match(repo, /decideWrite/);
        assert.match(repo, /version: decision\.version/);
    });

    it('studio lesson create starts at version 0 and update is OCC', () => {
        const studio = readFileSync(join(__dirname, '../controllers/studioController.js'), 'utf8');
        const validators = readFileSync(join(__dirname, '../validators/studioValidators.js'), 'utf8');
        assert.match(studio, /version: 0/);
        assert.match(studio, /decideWrite\(lesson/);
        assert.match(studio, /Version conflict/);
        assert.match(validators, /version: z\.number\(\)\.int\(\)\.min\(0\)\.optional\(\)/);
    });

    it('interaction save contract includes version', () => {
        const contracts = readFileSync(join(__dirname, '../contracts/platform.js'), 'utf8');
        assert.match(contracts, /version: z\.number\(\)\.int\(\)\.min\(0\)\.optional\(\)/);
        assert.match(contracts, /'attemptsMap', 'version'/);
    });
});
