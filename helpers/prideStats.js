const defaultPrideRepo = require('../repositories/prideRepo');
const defaultUsersRepo = require('../repositories/usersRepo');
const { notify: defaultNotify } = require('./notify');
const { log } = require('./logger');
const { sanitizeTypeKey } = require('./platformMissions');
const { reconstructPrideCounts, countOpsFrom } = require('./prideBackfill');
const { resolveAccentColor } = require('./publicProfile');
const {
    PRIDE_CATALOG,
    getPrideStat,
    typeCompletedKey,
    fastestLiveKey,
    isRankableLiveFinish,
    crownForRank,
    betterCrown,
} = require('./prideCatalog');

function createPrideStats({
    prideRepo = defaultPrideRepo,
    usersRepo = defaultUsersRepo,
    notify = defaultNotify,
    followGraph = null,
} = {}) {
    function isListed(user) {
        return Boolean(user && user.isPublicProfile === true && user.handle);
    }

    function pushLifetimeStars(ops, payload = {}, progressAfter = {}) {
        const stars = Number(progressAfter.lifetimeStarsEarned ?? payload.lifetimeStarsEarned);
        if (Number.isFinite(stars) && stars >= 0) {
            ops.push({ key: 'lifetimeStars', op: { set: stars } });
        }
    }

    async function applyAndRank(userId, listed, key, op) {
        const spec = getPrideStat(key);
        if (!spec) return null;
        const applied = await prideRepo.applyValue(userId, key, op);
        if (spec.sort !== 'asc' && applied.value <= 0) {
            await prideRepo.deleteRank(key, userId);
            await refreshBestCrown(userId);
            return null;
        }
        if (spec.sort === 'asc' && !applied.changed) return null;

        const previousGold = listed
            ? await prideRepo.listBoard(key, spec, 1)
            : [];
        const updatedAt = new Date();
        await prideRepo.upsertRank({
            statKey: key,
            userId,
            value: applied.value,
            listed,
            updatedAt,
        });
        const nextGold = listed ? await prideRepo.listBoard(key, spec, 1) : [];
        const gainedGold = listed
            && nextGold[0]
            && nextGold[0].user_id === userId
            && (!previousGold[0] || previousGold[0].user_id !== userId);
        const previousId = previousGold[0] && previousGold[0].user_id;
        await refreshBestCrown(userId);
        if (previousId && previousId !== userId) await refreshBestCrown(previousId);
        return {
            key,
            value: applied.value,
            gold: gainedGold ? { statKey: key, label: spec.label, value: applied.value } : null,
        };
    }

    async function syncFromProgressEvent(userId, eventType, payload = {}, progressAfter = {}) {
        try {
            await prideRepo.ensureIndexes();
            const user = await usersRepo.findByUserId(userId);
            const listed = isListed(user);
            const ops = [];

            if (eventType === 'COMPONENT_SUBMITTED') {
                const type = sanitizeTypeKey(payload.type);
                if (type) ops.push({ key: typeCompletedKey(type), op: { inc: 1 } });
                if (payload.mode === 'live') ops.push({ key: 'liveCompleted', op: { inc: 1 } });
                if (payload.isFirstAttempt === true && Number(payload.percentage) >= 100) {
                    ops.push({ key: 'perfectFirstTries', op: { inc: 1 } });
                }
                ops.push({ key: 'currentStreak', op: { set: Number(progressAfter.consecutiveCorrect) || 0 } });
                if (isRankableLiveFinish(payload)) {
                    const ms = Math.round(Number(payload.completionTimeMs));
                    ops.push({ key: 'fastestLiveMs', op: { min: ms } });
                    if (type) ops.push({ key: fastestLiveKey(type), op: { min: ms } });
                }
            } else if (eventType === 'LESSON_COMPLETED') {
                ops.push({ key: 'lessonsCompleted', op: { inc: 1 } });
            } else if (eventType === 'PROGRAM_ENROLLED') {
                ops.push({ key: 'programsEnrolled', op: { inc: 1 } });
            } else if (eventType === 'MISSION_CLAIMED') {
                const missions = Number(payload.count ?? progressAfter.missionsClaimed);
                if (Number.isFinite(missions) && missions >= 0) {
                    ops.push({ key: 'missionsClaimed', op: { set: missions } });
                } else {
                    ops.push({ key: 'missionsClaimed', op: { inc: 1 } });
                }
                pushLifetimeStars(ops, payload, progressAfter);
            } else if (eventType === 'ACHIEVEMENT_EARNED') {
                const n = Math.max(1, Number(payload.count) || 1);
                ops.push({ key: 'achievementsEarned', op: { inc: n } });
                pushLifetimeStars(ops, payload, progressAfter);
            } else if (eventType === 'STARS_AWARDED') {
                pushLifetimeStars(ops, payload, progressAfter);
                if (!ops.length && Number(payload.amount) > 0) {
                    ops.push({ key: 'lifetimeStars', op: { inc: Number(payload.amount) } });
                }
            } else if (eventType === 'FOLLOWERS_CHANGED') {
                ops.push({ key: 'followers', op: { set: Number(payload.count) || 0 } });
            } else {
                return { golds: [] };
            }

            const golds = [];
            for (const item of ops) {
                const result = await applyAndRank(userId, listed, item.key, item.op);
                if (result && result.gold) golds.push(result.gold);
            }

            for (const gold of golds) {
                await notify({
                    userId,
                    actorId: userId,
                    type: 'CROWN_GOLD',
                    title: `Gold crown: ${gold.label}`,
                    body: 'You are #1 on this pride board',
                    href: `/dashboard/student/pride/${encodeURIComponent(gold.statKey)}`,
                    payload: gold,
                });
                await notifyGoldFollowers(user, gold);
            }
            return { golds };
        } catch (err) {
            log('warn', 'pride_sync_failed', { msg: err.message });
            return { golds: [] };
        }
    }

    async function notifyGoldFollowers(winner, gold) {
        if (!winner || !followGraph || typeof followGraph.listFollowerIds !== 'function') return;
        let ids = [];
        try {
            ids = await followGraph.listFollowerIds(winner.user_id, { unmutedOnly: true });
        } catch (err) {
            log('warn', 'pride_gold_fanout_failed', { msg: err.message });
            return;
        }
        const displayName = winner.full_name || winner.name || winner.handle || 'A student';
        const href = winner.handle
            ? `/dashboard/student/u/${encodeURIComponent(winner.handle)}`
            : `/dashboard/student/pride/${encodeURIComponent(gold.statKey)}`;
        for (const followerId of ids.slice(0, 100)) {
            try {
                await notify({
                    userId: followerId,
                    actorId: winner.user_id,
                    type: 'CROWN_GOLD',
                    title: `${displayName} took gold: ${gold.label}`,
                    body: 'They are #1 on this pride board',
                    href,
                    payload: gold,
                });
            } catch (err) {
                log('warn', 'pride_gold_fanout_one_failed', { msg: err.message });
            }
        }
    }

    async function refreshBestCrown(userId) {
        if (!userId || typeof prideRepo.setBestCrown !== 'function') return null;
        const rows = await prideRepo.listRanksForUser(userId);
        const score = { gold: 3, silver: 2, bronze: 1 };
        let best = null;
        for (const row of rows || []) {
            if (row.listed !== true) continue;
            const standing = await rankFor(row.stat_key, userId);
            const crown = standing && standing.crown;
            if (crown && (!best || score[crown] > score[best])) best = crown;
            if (best === 'gold') break;
        }
        await prideRepo.setBestCrown(userId, best);
        return best;
    }

    async function setListed(userId, listed) {
        try {
            await prideRepo.ensureIndexes();
            await prideRepo.setListed(userId, listed === true);
            await refreshBestCrown(userId);
        } catch (err) {
            log('warn', 'pride_listed_failed', { msg: err.message });
        }
    }

    async function rankFor(statKey, userId) {
        const spec = getPrideStat(statKey);
        if (!spec) return null;
        const row = await prideRepo.getRank(statKey, userId);
        if (!row || row.listed !== true) {
            return {
                value: row ? row.value : null,
                rank: null,
                crown: null,
                listed: false,
                updatedAt: row ? row.updated_at : null,
            };
        }
        const better = await prideRepo.countBetter(statKey, spec, row.value, row.updated_at);
        const rank = better + 1;
        return {
            value: row.value,
            rank,
            crown: crownForRank(rank),
            listed: true,
            updatedAt: row.updated_at,
        };
    }

    async function hydrateRows(rows, { viewerId } = {}) {
        const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
        const users = ids.length && typeof usersRepo.findSafeByUserIds === 'function'
            ? await usersRepo.findSafeByUserIds(ids)
            : [];
        const byId = new Map(users.map((user) => [user.user_id, user]));
        const statsRows = ids.length && typeof prideRepo.listStatsByUserIds === 'function'
            ? await prideRepo.listStatsByUserIds(ids)
            : [];
        const statsById = new Map((statsRows || []).map((row) => [row.user_id, row]));
        let following = new Set();
        if (viewerId && followGraph && typeof followGraph.followingSet === 'function') {
            const idsFollowing = await followGraph.followingSet(viewerId, ids);
            following = new Set(idsFollowing || []);
        }
        return rows.map((row, index) => {
            const user = byId.get(row.user_id) || {};
            const stats = statsById.get(row.user_id) || {};
            const crown = crownForRank(index + 1);
            return {
                rank: index + 1,
                userId: row.user_id,
                handle: user.handle || null,
                displayName: user.full_name || user.name || user.handle || 'Student',
                value: row.value,
                crown,
                accentColor: resolveAccentColor(user),
                bestCrown: betterCrown(stats.best_crown, crown),
                following: following.has(row.user_id),
                updatedAt: row.updated_at,
            };
        });
    }

    async function boardFor(statKey, { userId, limit = 50 } = {}) {
        const spec = getPrideStat(statKey);
        if (!spec) return { error: 'Unknown stat', status: 404 };
        const raw = await prideRepo.listBoard(statKey, spec, limit);
        const board = await hydrateRows(raw, { viewerId: userId });
        let you = null;
        if (userId) {
            you = await rankFor(statKey, userId);
            if (you) {
                const mine = board.find((row) => row.userId === userId) || null;
                let gapToNext = null;
                if (you.rank && you.rank > 1) {
                    const aboveRaw = await prideRepo.getAtRank(statKey, spec, you.rank - 1);
                    const above = aboveRaw ? (await hydrateRows([aboveRaw], { viewerId: userId }))[0] : null;
                    if (above) {
                        const amount = spec.sort === 'asc'
                            ? (you.value || 0) - above.value
                            : above.value - (you.value || 0);
                        gapToNext = {
                            handle: above.handle,
                            displayName: above.displayName,
                            amount,
                            accentColor: above.accentColor,
                            bestCrown: above.bestCrown,
                            crown: above.crown,
                            following: above.following,
                        };
                    }
                }
                const self = typeof usersRepo.findByUserId === 'function'
                    ? await usersRepo.findByUserId(userId)
                    : null;
                you = {
                    ...you,
                    handle: (self && self.handle) || (mine && mine.handle) || null,
                    displayName: (self && (self.full_name || self.name || self.handle))
                        || (mine && mine.displayName)
                        || null,
                    gapToNext,
                };
            }
        }
        return { stat: spec, board, you };
    }

    async function summaryFor(userId) {
        const stats = [];
        for (const spec of PRIDE_CATALOG) {
            const leadersRaw = await prideRepo.listBoard(spec.key, spec, 3);
            const leaders = await hydrateRows(leadersRaw, { viewerId: userId });
            const you = userId ? await rankFor(spec.key, userId) : null;
            stats.push({
                ...spec,
                featured: spec.group === 'featured',
                you,
                leaders,
            });
        }
        return { catalog: PRIDE_CATALOG, stats };
    }

    async function crownsForUser(userId) {
        const rows = await prideRepo.listRanksForUser(userId);
        const held = [];
        for (const row of rows) {
            if (row.listed !== true) continue;
            const spec = getPrideStat(row.stat_key);
            if (!spec) continue;
            const standing = await rankFor(row.stat_key, userId);
            if (!standing || !standing.crown) continue;
            held.push({
                statKey: spec.key,
                label: spec.label,
                value: standing.value,
                crown: standing.crown,
                rank: standing.rank,
                unit: spec.unit,
            });
        }
        const gold = held.filter((item) => item.crown === 'gold');
        const silver = held.filter((item) => item.crown === 'silver');
        const bronze = held.filter((item) => item.crown === 'bronze');
        return { total: held.length, gold, silver, bronze, held };
    }

    async function wallForUser(userId, { viewerId } = {}) {
        const [stats, ranks] = await Promise.all([
            prideRepo.getStats(userId),
            prideRepo.listRanksForUser(userId),
        ]);
        const values = stats && stats.values ? stats.values : {};
        const rankByKey = new Map((ranks || []).map((row) => [row.stat_key, row]));
        const wall = [];
        for (const spec of PRIDE_CATALOG) {
            const row = rankByKey.get(spec.key);
            const raw = Number(values[spec.key]);
            let value = Number.isFinite(raw) ? raw : (row && Number.isFinite(row.value) ? row.value : null);
            let rank = null;
            let crown = null;
            if (row && row.listed === true) {
                const standing = await rankFor(spec.key, userId);
                if (standing) {
                    value = standing.value;
                    rank = standing.rank;
                    crown = standing.crown;
                }
            }
            const hasRecord = rank != null || (Number.isFinite(value) && value > 0);
            const gold = hasRecord ? null : await goldPreview(spec, { viewerId });
            wall.push({
                key: spec.key,
                label: spec.label,
                unit: spec.unit,
                group: spec.group,
                sort: spec.sort,
                value,
                rank,
                crown,
                gold,
            });
        }
        return wall;
    }

    function boardMatchesQuery(spec, q) {
        if (!q) return spec.group === 'featured';
        const hay = `${spec.label} ${spec.key}`.toLowerCase();
        return hay.includes(q);
    }

    function publicPerson(userOrRow) {
        if (!userOrRow) return null;
        const handle = userOrRow.handle || null;
        if (!handle) return null;
        return {
            handle,
            displayName: userOrRow.displayName || userOrRow.full_name || userOrRow.name || handle,
            accentColor: resolveAccentColor(userOrRow),
            bestCrown: betterCrown(userOrRow.bestCrown || userOrRow.best_crown, userOrRow.crown),
            following: userOrRow.following === true,
        };
    }

    async function goldPreview(spec, { viewerId } = {}) {
        const gold = await goldForStat(spec, { viewerId });
        if (!gold || !gold.handle) return null;
        return {
            handle: gold.handle,
            displayName: gold.displayName,
            value: gold.value,
            accentColor: gold.accentColor,
            bestCrown: betterCrown(gold.bestCrown, gold.crown),
            following: gold.following === true,
        };
    }

    async function goldForStat(spec, { viewerId } = {}) {
        const raw = await prideRepo.listBoard(spec.key, spec, 1);
        const leaders = await hydrateRows(raw, { viewerId });
        const gold = leaders[0];
        if (!gold || !gold.handle) return null;
        return {
            handle: gold.handle,
            displayName: gold.displayName,
            value: gold.value,
            userId: gold.userId,
            accentColor: gold.accentColor,
            bestCrown: betterCrown(gold.bestCrown, gold.crown),
            following: gold.following === true,
        };
    }

    function publicGold(row, hidden) {
        if (!row || !row.handle) return null;
        if (hidden.has(String(row.userId || ''))) return null;
        return {
            handle: row.handle,
            displayName: row.displayName,
            value: row.value,
            accentColor: row.accentColor,
            bestCrown: betterCrown(row.bestCrown, row.crown),
            following: row.following === true,
        };
    }

    async function decoratePeople(rows, { viewerId, hideUserIds = [] } = {}) {
        const hidden = new Set((hideUserIds || []).map(String).filter(Boolean));
        const visible = (rows || []).filter((row) => row && !hidden.has(String(row.user_id || '')));
        const ids = visible.map((row) => row.user_id).filter(Boolean);
        const statsRows = ids.length && typeof prideRepo.listStatsByUserIds === 'function'
            ? await prideRepo.listStatsByUserIds(ids)
            : [];
        const statsById = new Map((statsRows || []).map((row) => [row.user_id, row]));
        let following = new Set();
        if (viewerId && followGraph && typeof followGraph.followingSet === 'function') {
            following = new Set(await followGraph.followingSet(viewerId, ids) || []);
        }
        return visible.map((row) => publicPerson({
            ...row,
            best_crown: (statsById.get(row.user_id) || {}).best_crown || null,
            following: following.has(row.user_id),
        })).filter(Boolean);
    }

    async function discover(query, { hideUserIds = [], viewerId } = {}) {
        await prideRepo.ensureIndexes();
        const hidden = new Set((hideUserIds || []).map(String).filter(Boolean));
        const q = String(query || '').trim().slice(0, 40).toLowerCase();
        const specs = PRIDE_CATALOG.filter((spec) => boardMatchesQuery(spec, q)).slice(0, 8);
        const golds = [];
        for (const spec of specs) {
            golds.push(await goldForStat(spec, { viewerId }));
        }
        const boards = specs.map((spec, index) => ({
            key: spec.key,
            label: spec.label,
            unit: spec.unit,
            gold: publicGold(golds[index], hidden),
        }));

        let people = [];
        if (q && typeof usersRepo.searchPublic === 'function') {
            const rows = await usersRepo.searchPublic(q, 8);
            people = await decoratePeople(rows, { viewerId, hideUserIds: [...hidden] });
        } else {
            const seen = new Set();
            for (const gold of golds) {
                if (!gold || !gold.handle || hidden.has(String(gold.userId || '')) || seen.has(gold.handle)) continue;
                seen.add(gold.handle);
                people.push(publicPerson({
                    handle: gold.handle,
                    displayName: gold.displayName,
                    accentColor: gold.accentColor,
                    bestCrown: gold.bestCrown,
                    following: gold.following,
                }));
            }
            people = people.filter(Boolean).slice(0, 8);
        }

        return { mode: q ? 'search' : 'popular', people, boards };
    }

    async function importCounts(userId, counts, { at } = {}) {
        try {
            await prideRepo.ensureIndexes();
            const user = await usersRepo.findByUserId(userId);
            const listed = isListed(user);
            const existing = await prideRepo.getStats(userId);
            const existingValues = existing && existing.values ? existing.values : {};
            const fallbackAt = at instanceof Date && !Number.isNaN(at.getTime())
                ? at
                : new Date(0);

            let wrote = 0;
            for (const { key, value } of countOpsFrom(counts)) {
                const prev = Number(existingValues[key]);
                const next = Math.max(Number.isFinite(prev) ? prev : 0, Number(value) || 0);
                if (next <= 0) continue;
                if (!Number.isFinite(prev) || prev !== next) {
                    await prideRepo.applyValue(userId, key, { set: next });
                    wrote += 1;
                }
                const rank = await prideRepo.getRank(key, userId);
                const stamp = rank && Number(rank.value) === next && rank.updated_at
                    ? rank.updated_at
                    : fallbackAt;
                await prideRepo.upsertRank({
                    statKey: key,
                    userId,
                    value: next,
                    listed,
                    updatedAt: stamp,
                });
            }

            const streak = Number(counts.currentStreak) || 0;
            const prevStreak = Number(existingValues.currentStreak);
            if (!Number.isFinite(prevStreak) || prevStreak !== streak) {
                await prideRepo.applyValue(userId, 'currentStreak', { set: streak });
                wrote += 1;
            }
            if (streak <= 0) {
                await prideRepo.deleteRank('currentStreak', userId);
            } else {
                await prideRepo.upsertRank({
                    statKey: 'currentStreak',
                    userId,
                    value: streak,
                    listed,
                    updatedAt: fallbackAt,
                });
            }

            if (typeof prideRepo.setListed === 'function') {
                await prideRepo.setListed(userId, listed);
            }
            await refreshBestCrown(userId);

            return { wrote, listed, skipped: ['fastest live'] };
        } catch (err) {
            log('warn', 'pride_import_failed', { msg: err.message, userId });
            return { wrote: 0, listed: false, error: err.message };
        }
    }

    return {
        syncFromProgressEvent,
        setListed,
        rankFor,
        boardFor,
        summaryFor,
        crownsForUser,
        wallForUser,
        discover,
        importCounts,
        reconstructPrideCounts,
    };
}

const defaultFollowGraph = require('./followGraph');
const defaults = createPrideStats({ followGraph: defaultFollowGraph });

module.exports = {
    createPrideStats,
    ...defaults,
};
