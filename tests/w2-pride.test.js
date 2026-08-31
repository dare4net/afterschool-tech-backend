const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
    PRIDE_CATALOG,
    getPrideStat,
    isRankableLiveFinish,
    typeCompletedKey,
    crownForRank,
    betterCrown,
} = require('../helpers/prideCatalog');
const { createPrideStats } = require('../helpers/prideStats');
const { publicProfileFields } = require('../helpers/publicProfile');
const { reconstructPrideCounts, skippedPrideKeys } = require('../helpers/prideBackfill');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

function memoryPrideRepo() {
    const stats = new Map();
    const ranks = [];

    function rankIndex(statKey, userId) {
        return ranks.findIndex((row) => row.stat_key === statKey && row.user_id === userId);
    }

    function sortRows(spec, rows) {
        const dir = spec && spec.sort === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            if (a.value !== b.value) return dir === 1 ? a.value - b.value : b.value - a.value;
            const at = a.updated_at.getTime();
            const bt = b.updated_at.getTime();
            if (at !== bt) return at - bt;
            return String(a.user_id).localeCompare(String(b.user_id));
        });
    }

    return {
        async ensureIndexes() {},
        async getStats(userId) {
            return stats.get(userId) || null;
        },
        async applyValue(userId, key, op) {
            const current = stats.get(userId) || { user_id: userId, values: {} };
            const prev = Number(current.values[key]);
            let next;
            let changed = true;
            if (op.inc) next = (Number.isFinite(prev) ? prev : 0) + Number(op.inc);
            else if (Object.prototype.hasOwnProperty.call(op, 'set')) {
                next = Number(op.set) || 0;
                changed = !Number.isFinite(prev) || prev !== next;
            } else if (Object.prototype.hasOwnProperty.call(op, 'min')) {
                const candidate = Number(op.min);
                if (Number.isFinite(prev) && prev <= candidate) {
                    return { value: prev, changed: false };
                }
                next = candidate;
            }
            current.values[key] = next;
            stats.set(userId, current);
            return { value: next, changed };
        },
        async upsertRank({ statKey, userId, value, listed, updatedAt }) {
            const now = updatedAt || new Date();
            const idx = rankIndex(statKey, userId);
            const row = {
                stat_key: statKey,
                user_id: userId,
                value,
                listed: listed === true,
                updated_at: now,
            };
            if (idx >= 0) ranks[idx] = row;
            else ranks.push(row);
        },
        async deleteRank(statKey, userId) {
            const idx = rankIndex(statKey, userId);
            if (idx >= 0) ranks.splice(idx, 1);
        },
        async getRank(statKey, userId) {
            return ranks.find((row) => row.stat_key === statKey && row.user_id === userId) || null;
        },
        async listBoard(statKey, spec, limit = 50) {
            return sortRows(spec, ranks.filter((row) => row.stat_key === statKey && row.listed === true))
                .slice(0, limit);
        },
        async countBetter(statKey, spec, value, updatedAt) {
            const listed = ranks.filter((row) => row.stat_key === statKey && row.listed === true);
            return listed.filter((row) => {
                if (spec && spec.sort === 'asc') {
                    return row.value < value || (row.value === value && row.updated_at < updatedAt);
                }
                return row.value > value || (row.value === value && row.updated_at < updatedAt);
            }).length;
        },
        async getAtRank(statKey, spec, rank) {
            return (await this.listBoard(statKey, spec, rank))[rank - 1] || null;
        },
        async listRanksForUser(userId) {
            return ranks.filter((row) => row.user_id === userId);
        },
        async setListed(userId, listed) {
            for (const row of ranks) {
                if (row.user_id === userId) row.listed = listed === true;
            }
        },
    };
}

describe('W2 pride catalog and live-time rules', () => {
    it('publishes named stats plus per-type completed and fastest-live keys', () => {
        assert.equal(getPrideStat('missionsClaimed').label, 'Most missions');
        assert.equal(getPrideStat('achievementsEarned').label, 'Most achievements');
        assert.equal(getPrideStat('lifetimeStars').label, 'Most lifetime stars');
        assert.equal(getPrideStat('followers').label, 'Most followed');
        assert.equal(getPrideStat('quizzesCompleted').label, 'Quizzes completed');
        assert.equal(getPrideStat('fastestLiveMs').sort, 'asc');
        assert.equal(typeCompletedKey('quiz'), 'quizzesCompleted');
        assert.equal(typeCompletedKey('hangman'), 'hangmanCompleted');
        assert.equal(PRIDE_CATALOG.some((item) => item.key === 'fastestLive:hangman'), true);
        assert.equal(crownForRank(1), 'gold');
        assert.equal(crownForRank(3), 'bronze');
        assert.equal(crownForRank(4), null);
        assert.equal(betterCrown('silver', 'gold'), 'gold');
        assert.equal(betterCrown(null, 'bronze'), 'bronze');
        assert.equal(betterCrown(null, null), null);
    });

    it('only ranks live first-attempt completions with a real duration', () => {
        assert.equal(isRankableLiveFinish({
            mode: 'live',
            isFirstAttempt: true,
            completionTimeMs: 1400,
        }), true);
        assert.equal(isRankableLiveFinish({
            mode: 'practice',
            isFirstAttempt: true,
            completionTimeMs: 1400,
        }), false);
        assert.equal(isRankableLiveFinish({
            mode: 'live',
            isFirstAttempt: false,
            completionTimeMs: 1400,
        }), false);
        assert.equal(isRankableLiveFinish({
            mode: 'live',
            isFirstAttempt: true,
            completionTimeMs: 0,
        }), false);
    });
});

describe('W2 ranks, crowns, and listing', () => {
    it('ranks higher counts first and earlier ties first; time stats lower wins', async () => {
        const users = new Map([
            ['a', { user_id: 'a', handle: 'alice', full_name: 'Alice', isPublicProfile: true }],
            ['b', { user_id: 'b', handle: 'bob', full_name: 'Bob', isPublicProfile: true }],
        ]);
        const api = createPrideStats({
            prideRepo: memoryPrideRepo(),
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                findSafeByUserIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean),
            },
            notify: async () => null,
        });

        await api.syncFromProgressEvent('a', 'COMPONENT_SUBMITTED', { type: 'quiz', mode: 'live', isFirstAttempt: true, percentage: 100, completionTimeMs: 2000 });
        await new Promise((resolve) => setTimeout(resolve, 5));
        await api.syncFromProgressEvent('b', 'COMPONENT_SUBMITTED', { type: 'quiz', mode: 'live', isFirstAttempt: true, percentage: 100, completionTimeMs: 900 });

        const quizzes = await api.boardFor('quizzesCompleted', { userId: 'b' });
        assert.equal(quizzes.board[0].handle, 'alice');
        assert.equal(quizzes.you.rank, 2);
        assert.equal(quizzes.you.gapToNext.handle, 'alice');
        assert.equal(quizzes.you.gapToNext.amount, 0);

        const fastest = await api.boardFor('fastestLiveMs', { userId: 'b' });
        assert.equal(fastest.board[0].handle, 'bob');
        assert.equal(fastest.board[0].crown, 'gold');
        assert.equal(fastest.you.rank, 1);
    });

    it('notifies gold only when a public student newly takes #1', async () => {
        const notes = [];
        const users = new Map([
            ['a', { user_id: 'a', handle: 'alice', full_name: 'Alice', isPublicProfile: true }],
            ['b', { user_id: 'b', handle: 'bob', full_name: 'Bob', isPublicProfile: true }],
        ]);
        const api = createPrideStats({
            prideRepo: memoryPrideRepo(),
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                findSafeByUserIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean),
            },
            notify: async (input) => {
                notes.push(input);
                return input;
            },
        });

        const first = await api.syncFromProgressEvent('a', 'LESSON_COMPLETED', {});
        assert.equal(first.golds[0].statKey, 'lessonsCompleted');
        await api.syncFromProgressEvent('a', 'LESSON_COMPLETED', {});
        assert.equal(notes.filter((item) => item.type === 'CROWN_GOLD').length, 1);

        await api.syncFromProgressEvent('b', 'LESSON_COMPLETED', {});
        await api.syncFromProgressEvent('b', 'LESSON_COMPLETED', {});
        await api.syncFromProgressEvent('b', 'LESSON_COMPLETED', {});
        assert.equal(notes.filter((item) => item.userId === 'b' && item.type === 'CROWN_GOLD').length, 1);
    });

    it('keeps private students off boards until they opt in', async () => {
        const users = new Map([
            ['p', { user_id: 'p', handle: 'private_pat', full_name: 'Pat', isPublicProfile: false }],
        ]);
        const api = createPrideStats({
            prideRepo: memoryPrideRepo(),
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                findSafeByUserIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean),
            },
            notify: async () => null,
        });
        await api.syncFromProgressEvent('p', 'PROGRAM_ENROLLED', {});
        const board = await api.boardFor('programsEnrolled', { userId: 'p' });
        assert.equal(board.board.length, 0);
        assert.equal(board.you.listed, false);
        assert.equal(board.you.rank, null);

        users.get('p').isPublicProfile = true;
        await api.setListed('p', true);
        const publicBoard = await api.boardFor('programsEnrolled', { userId: 'p' });
        assert.equal(publicBoard.board[0].handle, 'private_pat');
        assert.equal(publicBoard.you.crown, 'gold');
    });

    it('search lists gold holder names in front of matching board titles', async () => {
        const users = new Map([
            ['a', { user_id: 'a', handle: 'alice', full_name: 'Alice', isPublicProfile: true }],
            ['b', { user_id: 'b', handle: 'bob', full_name: 'Bob', isPublicProfile: true }],
        ]);
        const api = createPrideStats({
            prideRepo: memoryPrideRepo(),
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                findSafeByUserIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean),
                searchPublic: async (q, limit = 8) => [...users.values()]
                    .filter((user) => user.isPublicProfile && user.handle && (
                        String(user.handle).startsWith(String(q || '').toLowerCase())
                        || String(user.full_name || '').toLowerCase().includes(String(q || '').toLowerCase())
                    ))
                    .slice(0, limit),
            },
            notify: async () => null,
        });
        await api.syncFromProgressEvent('a', 'COMPONENT_SUBMITTED', { type: 'quiz', mode: 'live', isFirstAttempt: true, percentage: 100, completionTimeMs: 1400 });

        const popular = await api.discover('');
        assert.equal(popular.mode, 'popular');
        assert.equal(popular.people[0].handle, 'alice');
        assert.equal(popular.boards.find((item) => item.key === 'quizzesCompleted').gold.displayName, 'Alice');

        const found = await api.discover('quiz');
        assert.equal(found.mode, 'search');
        assert.equal(found.people.some((item) => item.handle === 'alice'), false);
        assert.equal(found.boards[0].gold.handle, 'alice');
        const people = await api.discover('ali');
        assert.equal(people.people[0].displayName, 'Alice');
    });

    it('backfills counts from progress and never invents fastest-live or gold mail', async () => {
        const notes = [];
        const users = new Map([
            ['a', { user_id: 'a', handle: 'alice', full_name: 'Alice', isPublicProfile: true }],
        ]);
        const api = createPrideStats({
            prideRepo: memoryPrideRepo(),
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                findSafeByUserIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean),
            },
            notify: async (input) => {
                notes.push(input);
                return input;
            },
        });

        const counts = reconstructPrideCounts({
            progress: {
                liveSubmits: 3,
                perfectSubmits: 2,
                consecutiveCorrect: 4,
                lessonsCompleted: 1,
                submitsByType: { quiz: { total: 6 }, hangman: { total: 2 } },
            },
            lessonsCompleted: 9,
            programsEnrolled: 2,
        });
        assert.equal(counts.byType.quiz, 6);
        assert.equal(counts.lessonsCompleted, 9);
        assert.equal(counts.perfectFirstTries, 2);
        assert.equal(skippedPrideKeys().includes('fastestLiveMs'), true);

        await api.importCounts('a', counts, { at: new Date('2024-01-01') });
        await api.importCounts('a', reconstructPrideCounts({
            progress: { submitsByType: { quiz: { total: 2 } }, liveSubmits: 1 },
        }));

        const quizzes = await api.boardFor('quizzesCompleted', { userId: 'a' });
        const fastest = await api.boardFor('fastestLiveMs', { userId: 'a' });
        assert.equal(quizzes.you.value, 6);
        assert.equal(quizzes.you.crown, 'gold');
        assert.equal(fastest.board.length, 0);
        assert.equal(notes.length, 0);
        assert.match(read('scripts/backfill-pride.js'), /--dry-run/);
        assert.match(read('scripts/backfill-pride.js'), /skippedPrideKeys/);
    });
});

describe('W2 pride wiring and public JSON', () => {
    it('mounts public pride routes and never emails on pride or people JSON', () => {
        const server = read('server.js');
        const routes = read('routes/prideRoutes.js');
        const controller = read('controllers/prideController.js');
        const people = read('controllers/peopleController.js');
        const stats = read('controllers/statsController.js');
        const listenerHint = read('../ast4-lesson-builder/lib/achievement-listener.ts');
        assert.match(server, /app\.use\('\/api\/pride'/);
        assert.match(routes, /optionalAuthorize/);
        assert.equal(controller.includes('db.collection'), false);
        assert.equal(controller.includes('email'), false);
        assert.match(people, /goldCrowns/);
        assert.match(stats, /completionTimeMs/);
        assert.match(stats, /syncFromProgressEvent/);
        assert.match(read('helpers/prideStats.js'), /\/dashboard\/student\/pride/);
        assert.match(read('contracts/platform.js'), /completionTimeMs/);
        assert.equal(publicProfileFields({ email: 'hidden@school.edu', handle: 'maya' }).email, undefined);
        assert.match(listenerHint, /completionTimeMs: payload.completionTimeMs/);
    });

    it('loads pride summary in parallel and indexes ranks for sort plus user lookup', () => {
        const stats = read('helpers/prideStats.js');
        const repo = read('repositories/prideRepo.js');
        const server = read('server.js');
        assert.match(stats, /mapPool/);
        assert.match(stats, /Promise\.all/);
        assert.equal(stats.includes('await prideRepo.ensureIndexes()'), false);
        assert.match(repo, /user_id: 1 \}/);
        assert.match(repo, /value: -1, updated_at: 1, user_id: 1/);
        assert.match(server, /prideRepo.*ensureIndexes/);
    });
});
