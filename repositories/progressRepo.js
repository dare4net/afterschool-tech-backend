const { getMainDb } = require('../config/database');

const COLLECTION = 'student_progress';

const EMPTY_PROGRESS = {
    level: 1,
    completedMissions: [],
    componentsReset: 0,
    consecutiveCorrect: 0,
    lessonsReviewed: 0,
    lessonsCompleted: 0,
    starsSpent: 0,
    lifetimeStarsEarned: 0,
    totalSubmits: 0,
    liveSubmits: 0,
    practiceSubmits: 0,
    perfectSubmits: 0,
    perfectLiveSubmits: 0,
    perfectPracticeSubmits: 0,
    submitsByType: {},
};

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

async function findByUserId(userId) {
    return (await col()).findOne({ user_id: userId });
}

async function insertEmpty(userId) {
    const doc = {
        user_id: userId,
        ...EMPTY_PROGRESS,
        created_at: new Date(),
        updated_at: new Date(),
    };
    await (await col()).insertOne(doc);
    return doc;
}

async function getOrCreate(userId) {
    const existing = await findByUserId(userId);
    if (existing) return existing;
    return insertEmpty(userId);
}

async function update(userId, update) {
    const result = await (await col()).findOneAndUpdate(
        { user_id: userId },
        update,
        { returnDocument: 'after' }
    );
    return result.value || result;
}

module.exports = {
    COLLECTION,
    EMPTY_PROGRESS,
    findByUserId,
    getOrCreate,
    update,
};
