const { getMainDb } = require('../config/database');
const { previousUtcDay } = require('../helpers/loginStreak');

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
    submitsByLesson: {},
    submitsByComponent: {},
    loginStreak: 0,
    longestLoginStreak: 0,
    lastLoginDate: null,
    earlyUnlockLessonIds: [],
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

async function listStreakAtRisk(today, cap = 500) {
    const yesterday = previousUtcDay(today);
    if (!yesterday) return [];
    return (await col())
        .find({
            loginStreak: { $gte: 1 },
            lastLoginDate: yesterday,
        })
        .project({ user_id: 1, loginStreak: 1, lastLoginDate: 1 })
        .limit(Math.max(1, Number(cap) || 500))
        .toArray();
}

module.exports = {
    COLLECTION,
    EMPTY_PROGRESS,
    findByUserId,
    getOrCreate,
    update,
    listStreakAtRisk,
};
