const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createStudentProgress } = require('../helpers/studentProgress');
const { countForMission, sanitizeFilters } = require('../helpers/platformMissions');
const { EMPTY_PROGRESS } = require('../repositories/progressRepo');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function applyUpdate(doc, update) {
    const next = clone(doc);
    if (update.$set) Object.assign(next, update.$set);
    if (update.$inc) {
        for (const [key, amount] of Object.entries(update.$inc)) {
            const parts = key.split('.');
            let cur = next;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
                cur = cur[parts[i]];
            }
            const last = parts[parts.length - 1];
            cur[last] = (cur[last] || 0) + amount;
        }
    }
    return next;
}

function memoryProgress() {
    const docs = new Map();
    return {
        async getOrCreate(userId) {
            if (!docs.has(userId)) docs.set(userId, { user_id: userId, ...EMPTY_PROGRESS });
            return clone(docs.get(userId));
        },
        async update(userId, update) {
            const current = docs.get(userId) || { user_id: userId, ...EMPTY_PROGRESS };
            const next = applyUpdate(current, update);
            docs.set(userId, next);
            return clone(next);
        },
    };
}

describe('W1 component-specific quests', () => {
    it('keeps lessonId and componentId on mission filters', () => {
        const filters = sanitizeFilters({
            type: 'hangman',
            lessonId: 'lesson-1',
            componentId: 'hang-1',
            mode: 'live',
        });
        assert.equal(filters.lessonId, 'lesson-1');
        assert.equal(filters.componentId, 'hang-1');
        assert.equal(filters.type, 'hangman');
    });

    it('counts a specific block without crediting other hangmen', async () => {
        const api = createStudentProgress({
            progressRepo: memoryProgress(),
            walletRepo: { findByUserId: async () => ({ starBalance: 0 }) },
            statsRepo: {
                countProgramRegistrations: async () => 0,
                countUserPrograms: async () => 0,
                listCompletions: async () => [],
            },
        });
        await api.recordProgressEvent('user-1', 'COMPONENT_SUBMITTED', {
            type: 'hangman',
            mode: 'live',
            lessonId: 'lesson-1',
            componentId: 'hang-1',
            isFirstAttempt: true,
            percentage: 100,
        });
        await api.recordProgressEvent('user-1', 'COMPONENT_SUBMITTED', {
            type: 'hangman',
            mode: 'live',
            lessonId: 'lesson-2',
            componentId: 'hang-9',
            isFirstAttempt: true,
            percentage: 100,
        });
        const stored = await api.getOrCreateProgress('user-1');
        assert.equal(countForMission({
            stat: 'submits',
            targetCount: 1,
            filters: { lessonId: 'lesson-1', componentId: 'hang-1' },
        }, stored), 1);
        assert.equal(countForMission({
            stat: 'submits',
            targetCount: 1,
            filters: { lessonId: 'lesson-2' },
        }, stored), 1);
        assert.equal(countForMission({
            stat: 'submits',
            targetCount: 1,
            filters: { type: 'hangman' },
        }, stored), 2);
    });

    it('exposes Superadmin lesson/block targeting and submit identity fields', () => {
        const missions = readFileSync(join(__dirname, '../helpers/platformMissions.js'), 'utf8');
        const progress = readFileSync(join(__dirname, '../helpers/studentProgress.js'), 'utf8');
        const routes = readFileSync(join(__dirname, '../routes/superadminRoutes.js'), 'utf8');
        const fields = readFileSync(join(__dirname, '../contracts/platform.js'), 'utf8');
        const targets = readFileSync(join(__dirname, '../repositories/catalogTargetsRepo.js'), 'utf8');
        assert.match(missions, /lessonId/);
        assert.match(missions, /componentId/);
        assert.match(progress, /submitsByLesson/);
        assert.match(progress, /submitsByComponent/);
        assert.match(routes, /\/catalog\/targets/);
        assert.match(fields, /'lessonId', 'programId'/);
        assert.match(targets, /SCORED_COMPONENT_TYPES/);
        assert.equal(progress.includes('db.collection'), false);
    });
});
