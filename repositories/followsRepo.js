const { getMainDb } = require('../config/database');

const FOLLOWS = 'follows';
const BLOCKS = 'blocks';

async function followsCol() {
    return (await getMainDb()).collection(FOLLOWS);
}

async function blocksCol() {
    return (await getMainDb()).collection(BLOCKS);
}

async function ensureIndexes() {
    const follows = await followsCol();
    const blocks = await blocksCol();
    await follows.createIndex({ follower_id: 1, followee_id: 1 }, { unique: true });
    await follows.createIndex({ followee_id: 1, muted: 1 });
    await follows.createIndex({ follower_id: 1 });
    await blocks.createIndex({ actor_id: 1, target_id: 1 }, { unique: true });
    await blocks.createIndex({ target_id: 1 });
}

async function insertFollow(followerId, followeeId) {
    const now = new Date();
    const result = await (await followsCol()).updateOne(
        { follower_id: followerId, followee_id: followeeId },
        {
            $setOnInsert: {
                follower_id: followerId,
                followee_id: followeeId,
                muted: false,
                created_at: now,
            },
        },
        { upsert: true }
    );
    return result.upsertedCount === 1;
}

async function deleteFollow(followerId, followeeId) {
    await (await followsCol()).deleteOne({ follower_id: followerId, followee_id: followeeId });
}

async function deleteEdgesBetween(userA, userB) {
    await (await followsCol()).deleteMany({
        $or: [
            { follower_id: userA, followee_id: userB },
            { follower_id: userB, followee_id: userA },
        ],
    });
}

async function getFollow(followerId, followeeId) {
    return (await followsCol()).findOne({ follower_id: followerId, followee_id: followeeId });
}

async function setMuted(followerId, followeeId, muted) {
    const result = await (await followsCol()).updateOne(
        { follower_id: followerId, followee_id: followeeId },
        { $set: { muted: muted === true } }
    );
    return result.matchedCount === 1;
}

async function listFollowers(followeeId, { unmutedOnly = false } = {}) {
    const filter = { followee_id: followeeId };
    if (unmutedOnly) filter.muted = { $ne: true };
    return (await followsCol()).find(filter).toArray();
}

async function countFollowers(followeeId) {
    return (await followsCol()).countDocuments({ followee_id: followeeId });
}

async function countFollowing(followerId) {
    return (await followsCol()).countDocuments({ follower_id: followerId });
}

async function insertBlock(actorId, targetId) {
    const now = new Date();
    await (await blocksCol()).updateOne(
        { actor_id: actorId, target_id: targetId },
        {
            $setOnInsert: {
                actor_id: actorId,
                target_id: targetId,
                created_at: now,
            },
        },
        { upsert: true }
    );
}

async function deleteBlock(actorId, targetId) {
    await (await blocksCol()).deleteOne({ actor_id: actorId, target_id: targetId });
}

async function isBlocked(actorId, targetId) {
    const row = await (await blocksCol()).findOne({ actor_id: actorId, target_id: targetId });
    return Boolean(row);
}

async function blockedEitherWay(userA, userB) {
    const row = await (await blocksCol()).findOne({
        $or: [
            { actor_id: userA, target_id: userB },
            { actor_id: userB, target_id: userA },
        ],
    });
    return Boolean(row);
}

async function followingSet(followerId, followeeIds) {
    const ids = [...new Set((followeeIds || []).filter(Boolean))];
    if (!followerId || !ids.length) return [];
    const rows = await (await followsCol()).find(
        { follower_id: followerId, followee_id: { $in: ids } },
        { projection: { followee_id: 1 } }
    ).toArray();
    return rows.map((row) => row.followee_id);
}

async function hiddenUserIds(userId) {
    const blocks = await blocksCol();
    const [asActor, asTarget] = await Promise.all([
        blocks.find({ actor_id: userId }).toArray(),
        blocks.find({ target_id: userId }).toArray(),
    ]);
    return [...new Set([
        ...asActor.map((row) => row.target_id),
        ...asTarget.map((row) => row.actor_id),
    ])];
}

module.exports = {
    FOLLOWS,
    BLOCKS,
    ensureIndexes,
    insertFollow,
    deleteFollow,
    deleteEdgesBetween,
    getFollow,
    setMuted,
    listFollowers,
    countFollowers,
    countFollowing,
    insertBlock,
    deleteBlock,
    isBlocked,
    blockedEitherWay,
    followingSet,
    hiddenUserIds,
};
