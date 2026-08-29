const { ObjectId } = require('mongodb');
const { getMainDb } = require('../config/database');

const COLLECTION = 'notifications';

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

async function ensureIndexes() {
    const notifications = await col();
    await notifications.createIndex({ user_id: 1, created_at: -1 });
    await notifications.createIndex({ user_id: 1, read: 1 });
}

function toPublic(doc) {
    if (!doc) return null;
    return {
        id: String(doc._id),
        type: doc.type,
        actorId: doc.actor_id || null,
        title: doc.title || '',
        body: doc.body || '',
        href: doc.href || null,
        payload: doc.payload && typeof doc.payload === 'object' ? doc.payload : {},
        read: doc.read === true,
        createdAt: doc.created_at,
    };
}

async function insert(doc) {
    const record = {
        user_id: doc.user_id,
        type: doc.type,
        actor_id: doc.actor_id || null,
        title: doc.title || '',
        body: doc.body || '',
        href: doc.href || null,
        payload: doc.payload || {},
        read: false,
        created_at: new Date(),
    };
    const result = await (await col()).insertOne(record);
    return toPublic({ ...record, _id: result.insertedId });
}

async function listByUser(userId, { limit = 40, unreadOnly = false } = {}) {
    const filter = { user_id: userId };
    if (unreadOnly) filter.read = { $ne: true };
    const docs = await (await col())
        .find(filter)
        .sort({ created_at: -1 })
        .limit(Math.min(Number(limit) || 40, 80))
        .toArray();
    return docs.map(toPublic);
}

async function countUnread(userId) {
    return (await col()).countDocuments({ user_id: userId, read: { $ne: true } });
}

async function markRead(userId, ids) {
    const objectIds = (ids || [])
        .map((id) => {
            try {
                return new ObjectId(id);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
    if (!objectIds.length) return 0;
    const result = await (await col()).updateMany(
        { user_id: userId, _id: { $in: objectIds } },
        { $set: { read: true } }
    );
    return result.modifiedCount || 0;
}

async function markAllRead(userId) {
    const result = await (await col()).updateMany(
        { user_id: userId, read: { $ne: true } },
        { $set: { read: true } }
    );
    return result.modifiedCount || 0;
}

module.exports = {
    COLLECTION,
    ensureIndexes,
    toPublic,
    insert,
    listByUser,
    countUnread,
    markRead,
    markAllRead,
};
