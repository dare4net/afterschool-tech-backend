const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('path');
const { ObjectId } = require('mongodb');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');
const { EMPTY_PROGRESS } = require('../repositories/progressRepo');
const { createStudentProgress } = require('../helpers/studentProgress');
const { countForMission } = require('../helpers/platformMissions');
const { awardStarsBodySchema, claimMissionBodySchema, interactionSaveBodySchema } = require('../contracts/platform');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function applyUpdate(doc, update) {
    const next = clone(doc);
    if (update.$set) Object.assign(next, update.$set);
    if (update.$inc) {
        for (const [key, amount] of Object.entries(update.$inc)) {
            const parts = key.split('.');
            if (parts.length === 1) {
                next[key] = (next[key] || 0) + amount;
            } else {
                let cur = next;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
                    cur = cur[parts[i]];
                }
                const last = parts[parts.length - 1];
                cur[last] = (cur[last] || 0) + amount;
            }
        }
    }
    if (update.$addToSet) {
        for (const [key, value] of Object.entries(update.$addToSet)) {
            const list = Array.isArray(next[key]) ? [...next[key]] : [];
            if (!list.includes(value)) list.push(value);
            next[key] = list;
        }
    }
    return next;
}

function memoryWallet() {
    const docs = new Map();
    return {
        findByUserId: async (userId) => (docs.has(userId) ? clone(docs.get(userId)) : null),
        earnTransaction(amount, reason, componentId) {
            return {
                id: new ObjectId().toString(),
                type: 'earn',
                amount,
                reason,
                componentId: componentId || null,
                at: new Date(),
            };
        },
        async applyBalanceChange(userId, { inc, transaction, upsert = false }) {
            let wallet = docs.get(userId);
            if (!wallet) {
                if (!upsert) return null;
                wallet = { user_id: userId, starBalance: 0, transactions: [] };
            }
            wallet = {
                ...wallet,
                starBalance: (wallet.starBalance || 0) + inc,
                transactions: [...(wallet.transactions || []), transaction],
            };
            docs.set(userId, wallet);
            return clone(wallet);
        },
    };
}

function memoryProgress() {
    const docs = new Map();
    return {
        async getOrCreate(userId) {
            if (!docs.has(userId)) {
                docs.set(userId, { user_id: userId, ...EMPTY_PROGRESS });
            }
            return clone(docs.get(userId));
        },
        async update(userId, update) {
            const current = docs.has(userId)
                ? docs.get(userId)
                : { user_id: userId, ...EMPTY_PROGRESS };
            const next = applyUpdate(current, update);
            docs.set(userId, next);
            return clone(next);
        },
    };
}

function memoryStats({ programsEnrolled = 0, completions = [] } = {}) {
    return {
        countProgramRegistrations: async () => programsEnrolled,
        countUserPrograms: async () => 0,
        listCompletions: async () => completions,
    };
}

function progressService(options = {}) {
    const stats = options.stats || memoryStats();
    return {
        stats,
        wallet: options.wallet || memoryWallet(),
        progress: options.progress || memoryProgress(),
        get api() {
            return createStudentProgress({
                progressRepo: this.progress,
                walletRepo: this.wallet,
                statsRepo: this.stats,
            });
        },
    };
}

describe('G1 mission claim and wallet persistence', () => {
    it('rejects an unearned or unknown mission without crediting stars', async () => {
        const { api, wallet } = progressService();
        const unknown = await api.claimMission('user-1', 'not-a-mission');
        assert.equal(unknown.error, 'Unknown mission');
        assert.equal(unknown.status, 400);

        const unearned = await api.claimMission('user-1', 'l1-enroll-program');
        assert.equal(unearned.error, 'Mission is not complete');
        assert.equal(await wallet.findByUserId('user-1'), null);
    });

    it('credits mission stars once and keeps the balance after a second claim', async () => {
        const { api, wallet } = progressService({
            stats: memoryStats({ programsEnrolled: 1 }),
        });

        const first = await api.claimMission('user-1', 'l1-enroll-program');
        assert.equal(first.starBalance, 3);
        assert.deepEqual(first.completedMissions, ['l1-enroll-program']);

        const again = await api.claimMission('user-1', 'l1-enroll-program');
        assert.equal(again.alreadyClaimed, true);
        assert.equal(again.starBalance, 3);

        const stored = await wallet.findByUserId('user-1');
        assert.equal(stored.starBalance, 3);
        assert.equal(stored.transactions.length, 1);
    });
});

describe('G1 enrol → complete live work → stars persist', () => {
    it('awards live-completion stars, then a claim, and the wallet still has both after a reload', async () => {
        const stats = memoryStats({ programsEnrolled: 0 });
        const wallet = memoryWallet();
        const progress = memoryProgress();
        const api = createStudentProgress({
            progressRepo: progress,
            walletRepo: wallet,
            statsRepo: stats,
        });

        // Enrol in a program (catalog register).
        stats.countProgramRegistrations = async () => 1;

        // Complete a live activity — same credit path as POST /wallet/award.
        const liveAward = wallet.earnTransaction(5, 'Live completion: quiz', 'quiz-1');
        const afterLive = await wallet.applyBalanceChange('user-1', {
            inc: 5,
            transaction: liveAward,
            upsert: true,
        });
        assert.equal(afterLive.starBalance, 5);

        const enrollClaim = await api.claimMission('user-1', 'l1-enroll-program');
        assert.equal(enrollClaim.starBalance, 8);

        const earnClaim = await api.claimMission('user-1', 'l1-earn-stars');
        assert.equal(earnClaim.starBalance, 13);
        assert.deepEqual(earnClaim.completedMissions.sort(), ['l1-earn-stars', 'l1-enroll-program']);

        // "Reload" — a later GET /wallet read.
        const reloaded = await wallet.findByUserId('user-1');
        assert.equal(reloaded.starBalance, 13);
        assert.equal(reloaded.transactions.length, 3);
    });

    it('does not level up until every current-level mission is claimed', async () => {
        const { api } = progressService({ stats: memoryStats({ programsEnrolled: 1 }) });
        await api.claimMission('user-1', 'l1-enroll-program');
        const blocked = await api.levelUp('user-1');
        assert.equal(blocked.error, 'Claim all missions before leveling up');
    });
});

describe('G1 money-path contracts', () => {
    it('accepts the wallet, mission, and interaction payloads used on that path', () => {
        assert.equal(awardStarsBodySchema.parse({ amount: 5, reason: 'Live completion: quiz', componentId: 'quiz-1' }).amount, 5);
        assert.equal(claimMissionBodySchema.parse({ missionId: 'l1-enroll-program' }).missionId, 'l1-enroll-program');
        assert.equal(
            interactionSaveBodySchema.parse({
                lessonId: 'lesson-1',
                componentsState: { quiz: { status: 'completed', score: 10 } },
                lessonState: { lessonTitle: 'Live quiz', score: 10 },
            }).lessonId,
            'lesson-1'
        );
        assert.equal(awardStarsBodySchema.safeParse({ amount: 0 }).success, false);
        assert.equal(claimMissionBodySchema.safeParse({ missionId: 'Bonus Stars' }).success, false);
        assert.match(read('controllers/walletController.js'), /alreadyAwarded/);
        assert.match(read('controllers/walletController.js'), /hasAwardedComponent/);
        assert.match(read('repositories/walletRepo.js'), /awarded_components/);
    });
});

describe('G1 expandable progress facts', () => {
    it('counts live quiz submits and lifetime stars from recorded events', async () => {
        const { api, progress } = progressService();
        const submitted = await api.recordProgressEvent('user-1', 'COMPONENT_SUBMITTED', {
            type: 'quiz',
            mode: 'live',
            isFirstAttempt: true,
            percentage: 100,
        });
        assert.equal(submitted.liveSubmits, 1);
        assert.equal(submitted.perfectSubmits, 1);
        assert.equal(submitted.submitsByType.quiz.perfectLive, 1);

        await api.recordProgressEvent('user-1', 'STARS_AWARDED', { amount: 7 });
        await api.recordProgressEvent('user-1', 'STARS_SPENT', { amount: 5 });
        await api.recordProgressEvent('user-1', 'LESSON_COMPLETED');
        const stored = await progress.getOrCreate('user-1');
        assert.equal(stored.lifetimeStarsEarned, 7);
        assert.equal(stored.starsSpent, 5);
        assert.equal(stored.lessonsCompleted, 1);

        const stats = await api.gatherMissionStats('user-1', stored, 2);
        assert.equal(countForMission({
            stat: 'submits',
            targetCount: 1,
            filters: { mode: 'live', type: 'quiz', perfect: true },
        }, stats), 1);
        assert.equal(countForMission({
            stat: 'submits',
            targetCount: 1,
            filters: { lessonId: 'lesson-9', componentId: 'hang-1' },
        }, {
            submitsByComponent: { 'lesson-9__hang-1': { total: 1 } },
        }), 1);
        assert.equal(stats.lifetimeStarsEarned, 7);
        assert.equal(stats.lessonsCompleted, 1);
    });
});
