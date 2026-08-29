const { getMainDb } = require('../config/database');

async function col() {
    return (await getMainDb()).collection('student_achievements');
}

async function listByUser(userId) {
    return (await col()).find({ user_id: userId }).toArray();
}

async function findEarned(userId, achievementId) {
    return (await col()).findOne({ user_id: userId, achievement_id: achievementId });
}

async function insertEarned(record) {
    await (await col()).insertOne(record);
    return record;
}

module.exports = {
    listByUser,
    findEarned,
    insertEarned,
};
