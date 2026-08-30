const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createPrideStats } = require('../helpers/prideStats');
const { createFollowGraph } = require('../helpers/followGraph');
const { PRIDE_CATALOG } = require('../helpers/prideCatalog');
const { publicProfileFields } = require('../helpers/publicProfile');

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
            const row = { stat_key: statKey, user_id: userId, value, listed: listed === true, updated_at: now };
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
            return sortRows(spec, ranks.filter((row) => row.stat_key === statKey && row.listed === true)).slice(0, limit);
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

function memoryFollowsRepo() {
    const follows = [];
    const blocks = [];

    function followIndex(followerId, followeeId) {
        return follows.findIndex((row) => row.follower_id === followerId && row.followee_id === followeeId);
    }

    return {
        async ensureIndexes() {},
        async insertFollow(followerId, followeeId) {
            if (followIndex(followerId, followeeId) >= 0) return false;
            follows.push({ follower_id: followerId, followee_id: followeeId, muted: false, created_at: new Date() });
            return true;
        },
        async deleteFollow(followerId, followeeId) {
            const idx = followIndex(followerId, followeeId);
            if (idx >= 0) follows.splice(idx, 1);
        },
        async deleteEdgesBetween(userA, userB) {
            for (let i = follows.length - 1; i >= 0; i -= 1) {
                const row = follows[i];
                if (
                    (row.follower_id === userA && row.followee_id === userB)
                    || (row.follower_id === userB && row.followee_id === userA)
                ) {
                    follows.splice(i, 1);
                }
            }
        },
        async getFollow(followerId, followeeId) {
            return follows.find((row) => row.follower_id === followerId && row.followee_id === followeeId) || null;
        },
        async setMuted(followerId, followeeId, muted) {
            const row = await this.getFollow(followerId, followeeId);
            if (!row) return false;
            row.muted = muted === true;
            return true;
        },
        async listFollowers(followeeId, { unmutedOnly = false } = {}) {
            return follows.filter((row) => row.followee_id === followeeId && (!unmutedOnly || row.muted !== true));
        },
        async countFollowers(followeeId) {
            return follows.filter((row) => row.followee_id === followeeId).length;
        },
        async countFollowing(followerId) {
            return follows.filter((row) => row.follower_id === followerId).length;
        },
        async insertBlock(actorId, targetId) {
            if (!blocks.some((row) => row.actor_id === actorId && row.target_id === targetId)) {
                blocks.push({ actor_id: actorId, target_id: targetId, created_at: new Date() });
            }
        },
        async deleteBlock(actorId, targetId) {
            const idx = blocks.findIndex((row) => row.actor_id === actorId && row.target_id === targetId);
            if (idx >= 0) blocks.splice(idx, 1);
        },
        async isBlocked(actorId, targetId) {
            return blocks.some((row) => row.actor_id === actorId && row.target_id === targetId);
        },
        async blockedEitherWay(userA, userB) {
            return blocks.some((row) => (
                (row.actor_id === userA && row.target_id === userB)
                || (row.actor_id === userB && row.target_id === userA)
            ));
        },
        async hiddenUserIds(userId) {
            return [...new Set([
                ...blocks.filter((row) => row.actor_id === userId).map((row) => row.target_id),
                ...blocks.filter((row) => row.target_id === userId).map((row) => row.actor_id),
            ])];
        },
    };
}

describe('W3 follow graph', () => {
    it('follows instantly, blocks drop both edges, and mute needs an existing follow', async () => {
        const users = new Map([
            ['maya', { user_id: 'maya', handle: 'maya_codes', full_name: 'Maya', isPublicProfile: true }],
            ['leo', { user_id: 'leo', handle: 'leo_wins', full_name: 'Leo', isPublicProfile: true }],
        ]);
        const notes = [];
        const graph = createFollowGraph({
            followsRepo: memoryFollowsRepo(),
            usersRepo: {
                ensureIndexes: async () => {},
                findByHandle: async (handle) => [...users.values()].find((user) => user.handle === handle) || null,
                findByUserId: async (id) => users.get(id) || null,
            },
            notify: async (input) => {
                notes.push(input);
                return input;
            },
        });

        const followed = await graph.follow('leo', 'maya_codes');
        assert.equal(followed.following, true);
        assert.equal(notes[0].type, 'FOLLOWED_YOU');
        assert.equal(notes[0].userId, 'maya');
        assert.equal(notes[0].actorId, 'leo');
        assert.equal(JSON.stringify(notes[0]).includes('email'), false);

        const again = await graph.follow('leo', 'maya_codes');
        assert.equal(again.following, true);
        assert.equal(notes.length, 1);

        const counts = await graph.counts('maya');
        assert.equal(counts.followerCount, 1);
        assert.equal((await graph.viewerState('leo', 'maya')).following, true);

        await graph.mute('leo', 'maya_codes', true);
        assert.equal((await graph.viewerState('leo', 'maya')).muted, true);

        await graph.block('maya', 'leo_wins');
        assert.equal((await graph.counts('maya')).followerCount, 0);
        const blockedFollow = await graph.follow('leo', 'maya_codes');
        assert.equal(blockedFollow.status, 403);
        assert.equal((await graph.follow('maya', 'maya_codes')).status, 400);
    });
});

describe('W3 profile wall and gold fan-out', () => {
    it('lists every pride on the wall and splits gold silver bronze', async () => {
        const users = new Map([
            ['a', { user_id: 'a', handle: 'alice', full_name: 'Alice', isPublicProfile: true }],
            ['b', { user_id: 'b', handle: 'bob', full_name: 'Bob', isPublicProfile: true }],
            ['c', { user_id: 'c', handle: 'cara', full_name: 'Cara', isPublicProfile: true }],
        ]);
        const api = createPrideStats({
            prideRepo: memoryPrideRepo(),
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                findSafeByUserIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean),
            },
            notify: async () => null,
        });

        await api.syncFromProgressEvent('a', 'LESSON_COMPLETED', {});
        await api.syncFromProgressEvent('b', 'LESSON_COMPLETED', {});
        await api.syncFromProgressEvent('c', 'LESSON_COMPLETED', {});
        await api.syncFromProgressEvent('a', 'PROGRAM_ENROLLED', {});

        const wall = await api.wallForUser('a');
        assert.equal(wall.length, PRIDE_CATALOG.length);
        assert.equal(wall.every((item) => Boolean(item.key && item.label)), true);
        const lessons = wall.find((item) => item.key === 'lessonsCompleted');
        assert.equal(lessons.rank, 1);
        assert.equal(lessons.crown, 'gold');
        const empty = wall.find((item) => item.key === 'fastestLiveMs');
        assert.equal(empty.value, null);

        const crowns = await api.crownsForUser('a');
        assert.equal(crowns.gold.some((item) => item.statKey === 'lessonsCompleted'), true);
        assert.equal(Array.isArray(crowns.silver), true);
        assert.equal(Array.isArray(crowns.bronze), true);
    });

    it('fans gold mail to unmuted followers only, never on every submit', async () => {
        const users = new Map([
            ['star', { user_id: 'star', handle: 'star_kid', full_name: 'Star', isPublicProfile: true }],
            ['fan', { user_id: 'fan', handle: 'fan_one', full_name: 'Fan', isPublicProfile: true }],
            ['quiet', { user_id: 'quiet', handle: 'quiet_one', full_name: 'Quiet', isPublicProfile: true }],
        ]);
        const notes = [];
        const followsRepo = memoryFollowsRepo();
        const graph = createFollowGraph({
            followsRepo,
            usersRepo: {
                ensureIndexes: async () => {},
                findByHandle: async (handle) => [...users.values()].find((user) => user.handle === handle) || null,
                findByUserId: async (id) => users.get(id) || null,
            },
            notify: async () => null,
        });
        await graph.follow('fan', 'star_kid');
        await graph.follow('quiet', 'star_kid');
        await graph.mute('quiet', 'star_kid', true);

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
            followGraph: graph,
        });

        const first = await api.syncFromProgressEvent('star', 'LESSON_COMPLETED', {});
        assert.equal(first.golds.length, 1);
        const golds = notes.filter((item) => item.type === 'CROWN_GOLD');
        assert.equal(golds.filter((item) => item.userId === 'star' && item.actorId === 'star').length, 1);
        assert.equal(golds.filter((item) => item.userId === 'fan' && item.actorId === 'star').length, 1);
        assert.equal(golds.filter((item) => item.userId === 'quiet').length, 0);

        await api.syncFromProgressEvent('star', 'LESSON_COMPLETED', {});
        assert.equal(notes.filter((item) => item.type === 'CROWN_GOLD').length, 2);

        const quizGold = await api.syncFromProgressEvent('star', 'COMPONENT_SUBMITTED', {
            type: 'quiz',
            mode: 'practice',
            isFirstAttempt: false,
            percentage: 80,
        });
        assert.equal(quizGold.golds[0].statKey, 'quizzesCompleted');
        assert.equal(notes.filter((item) => item.type === 'CROWN_GOLD').length, 4);

        await api.syncFromProgressEvent('star', 'COMPONENT_SUBMITTED', {
            type: 'quiz',
            mode: 'practice',
            isFirstAttempt: false,
            percentage: 80,
        });
        assert.equal(notes.filter((item) => item.type === 'CROWN_GOLD').length, 4);
    });

    it('ranks missions, achievements, stars, and followers, and shows gold on empty wall tiles', async () => {
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

        await api.syncFromProgressEvent('a', 'MISSION_CLAIMED', { count: 3 }, { lifetimeStarsEarned: 40 });
        await api.syncFromProgressEvent('a', 'ACHIEVEMENT_EARNED', { count: 2 });
        await api.syncFromProgressEvent('a', 'FOLLOWERS_CHANGED', { count: 5 });
        await api.syncFromProgressEvent('b', 'STARS_AWARDED', { amount: 12 }, { lifetimeStarsEarned: 12 });

        const missions = await api.boardFor('missionsClaimed', { userId: 'a' });
        assert.equal(missions.you.rank, 1);
        assert.equal(missions.you.crown, 'gold');

        const stars = await api.boardFor('lifetimeStars', { userId: 'a' });
        assert.equal(stars.you.value, 40);
        assert.equal(stars.board[0].handle, 'alice');

        const followers = await api.boardFor('followers', { userId: 'a' });
        assert.equal(followers.you.value, 5);

        await api.syncFromProgressEvent('a', 'FOLLOWERS_CHANGED', { count: 0 });
        const emptyFollowers = await api.boardFor('followers', { userId: 'a' });
        assert.equal(emptyFollowers.board.length, 0);

        const wall = await api.wallForUser('b');
        const missionTile = wall.find((item) => item.key === 'missionsClaimed');
        assert.equal(missionTile.rank, null);
        assert.equal(missionTile.gold.handle, 'alice');
        assert.equal(missionTile.gold.displayName, 'Alice');
        const starTile = wall.find((item) => item.key === 'lifetimeStars');
        assert.equal(starTile.rank, 2);
        assert.equal(starTile.gold, null);
    });

    it('hides blocked students from discover people', async () => {
        const users = new Map([
            ['a', { user_id: 'a', handle: 'alice', full_name: 'Alice', isPublicProfile: true }],
            ['b', { user_id: 'b', handle: 'bob', full_name: 'Bob', isPublicProfile: true }],
        ]);
        const api = createPrideStats({
            prideRepo: memoryPrideRepo(),
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                findSafeByUserIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean),
                searchPublic: async (q) => [...users.values()].filter((user) => user.handle.includes(q)),
            },
            notify: async () => null,
        });
        const found = await api.discover('ali', { hideUserIds: ['a'] });
        assert.equal(found.people.some((item) => item.handle === 'alice'), false);
    });
});

describe('W3 people wiring', () => {
    it('keeps people JSON public and mounts follow routes before :handle', () => {
        const controller = read('controllers/peopleController.js');
        const routes = read('routes/peopleRoutes.js');
        const repo = read('repositories/followsRepo.js');
        const stats = read('helpers/prideStats.js');
        assert.match(controller, /silverCrowns/);
        assert.match(controller, /bronzeCrowns/);
        assert.match(controller, /wall/);
        assert.match(controller, /FOLLOWERS_CHANGED/);
        assert.match(controller, /accentColor/);
        assert.match(controller, /avatarId/);
        assert.match(controller, /bestCrown/);
        assert.match(read('helpers/publicProfile.js'), /ACCENT_COLORS/);
        assert.match(read('controllers/prideController.js'), /bestCrown/);
        assert.match(controller, /item\.gold\.handle/);
        assert.match(controller, /followerCount/);
        assert.match(controller, /viewer/);
        assert.match(controller, /followGraph/);
        assert.equal(controller.includes('email'), false);
        assert.equal(controller.includes('db.collection'), false);
        assert.equal(controller.includes('getMainDb'), false);
        assert.match(routes, /optionalAuthorize/);
        assert.match(routes, /router\.post\('\/:handle\/follow'/);
        assert.match(routes, /router\.delete\('\/:handle\/follow'/);
        assert.match(routes, /router\.post\('\/:handle\/mute'/);
        assert.match(routes, /router\.post\('\/:handle\/block'/);
        assert.match(repo, /follower_id: 1, followee_id: 1/);
        assert.match(stats, /notifyGoldFollowers/);
        assert.match(stats, /unmutedOnly: true/);
        assert.equal(publicProfileFields({ email: 'hidden@school.edu', handle: 'maya', full_name: 'Maya' }).email, undefined);
    });
});
