const { getMainDb } = require('../config/database');
const { sortBoard, betterFilter } = require('../helpers/prideCatalog');

const STATS = 'student_public_stats';
const RANKS = 'stats_ranks';

async function statsCol() {
    return (await getMainDb()).collection(STATS);
}

async function ranksCol() {
    return (await getMainDb()).collection(RANKS);
}

async function ensureIndexes() {
    const stats = await statsCol();
    const ranks = await ranksCol();
    await stats.createIndex({ user_id: 1 }, { unique: true });
    await ranks.createIndex({ stat_key: 1, user_id: 1 }, { unique: true });
    await ranks.createIndex({ stat_key: 1, listed: 1, value: 1, updated_at: 1 });
}

async function getStats(userId) {
    return (await statsCol()).findOne({ user_id: userId });
}

async function applyValue(userId, key, op) {
    const now = new Date();
    const current = await getStats(userId);
    const prev = current && current.values ? Number(current.values[key]) : NaN;
    let next;
    let changed = true;
    if (op.inc) {
        next = (Number.isFinite(prev) ? prev : 0) + Number(op.inc);
    } else if (Object.prototype.hasOwnProperty.call(op, 'set')) {
        next = Number(op.set) || 0;
        changed = !Number.isFinite(prev) || prev !== next;
    } else if (Object.prototype.hasOwnProperty.call(op, 'min')) {
        const candidate = Number(op.min);
        if (Number.isFinite(prev) && prev <= candidate) {
            return { value: prev, changed: false };
        }
        next = candidate;
    } else {
        return { value: Number.isFinite(prev) ? prev : 0, changed: false };
    }

    await (await statsCol()).updateOne(
        { user_id: userId },
        {
            $set: { [`values.${key}`]: next, updated_at: now },
            $setOnInsert: { user_id: userId, created_at: now },
        },
        { upsert: true }
    );
    return { value: next, changed };
}

async function upsertRank({ statKey, userId, value, listed, updatedAt }) {
    const now = updatedAt || new Date();
    await (await ranksCol()).updateOne(
        { stat_key: statKey, user_id: userId },
        {
            $set: {
                value,
                listed: listed === true,
                updated_at: now,
            },
            $setOnInsert: {
                stat_key: statKey,
                user_id: userId,
                created_at: now,
            },
        },
        { upsert: true }
    );
}

async function deleteRank(statKey, userId) {
    await (await ranksCol()).deleteOne({ stat_key: statKey, user_id: userId });
}

async function getRank(statKey, userId) {
    return (await ranksCol()).findOne({ stat_key: statKey, user_id: userId });
}

async function listBoard(statKey, spec, limit = 50) {
    return (await ranksCol())
        .find({ stat_key: statKey, listed: true })
        .sort(sortBoard(spec))
        .limit(Math.min(Number(limit) || 50, 50))
        .toArray();
}

async function countBetter(statKey, spec, value, updatedAt) {
    return (await ranksCol()).countDocuments({
        stat_key: statKey,
        listed: true,
        ...betterFilter(spec, value, updatedAt),
    });
}

async function getAtRank(statKey, spec, rank) {
    const skip = Math.max(Number(rank) || 1, 1) - 1;
    const rows = await (await ranksCol())
        .find({ stat_key: statKey, listed: true })
        .sort(sortBoard(spec))
        .skip(skip)
        .limit(1)
        .toArray();
    return rows[0] || null;
}

async function listRanksForUser(userId) {
    return (await ranksCol()).find({ user_id: userId }).toArray();
}

async function setListed(userId, listed) {
    await (await ranksCol()).updateMany(
        { user_id: userId },
        { $set: { listed: listed === true } }
    );
}

async function setBestCrown(userId, crown) {
    const now = new Date();
    await (await statsCol()).updateOne(
        { user_id: userId },
        {
            $set: { best_crown: crown || null, updated_at: now },
            $setOnInsert: { user_id: userId, values: {}, created_at: now },
        },
        { upsert: true }
    );
}

async function listStatsByUserIds(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return [];
    return (await statsCol()).find({ user_id: { $in: ids } }).toArray();
}

module.exports = {
    STATS,
    RANKS,
    ensureIndexes,
    getStats,
    applyValue,
    upsertRank,
    deleteRank,
    getRank,
    listBoard,
    getAtRank,
    countBetter,
    listRanksForUser,
    setListed,
    setBestCrown,
    listStatsByUserIds,
};
