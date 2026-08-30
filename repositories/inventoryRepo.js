const { getMainDb } = require('../config/database');

const COLLECTION = 'student_inventory';

const EMPTY = {
    items: {},
    buffs: {},
};

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

async function findByUserId(userId) {
    return (await col()).findOne({ user_id: userId });
}

async function getOrCreate(userId) {
    const existing = await findByUserId(userId);
    if (existing) return existing;
    const doc = {
        user_id: userId,
        ...EMPTY,
        created_at: new Date(),
        updated_at: new Date(),
    };
    await (await col()).insertOne(doc);
    return doc;
}

async function update(userId, update) {
    const result = await (await col()).findOneAndUpdate(
        { user_id: userId },
        update,
        { upsert: true, returnDocument: 'after' }
    );
    return result.value || result;
}

module.exports = {
    COLLECTION,
    EMPTY,
    findByUserId,
    getOrCreate,
    update,
};
