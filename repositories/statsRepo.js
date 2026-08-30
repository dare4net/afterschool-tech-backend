const { getMainDb } = require('../config/database');

async function main() {
    return getMainDb();
}

async function listCompletions(userId) {
    return (await main()).collection('lesson_completions').find({ user_id: userId }).toArray();
}

async function countAchievements(userId) {
    return (await main()).collection('student_achievements').countDocuments({ user_id: userId });
}

async function countHigherScorers(totalScore) {
    const rows = await (await main()).collection('lesson_completions').aggregate([
        { $group: { _id: '$user_id', totalScore: { $sum: '$score' } } },
        { $match: { totalScore: { $gt: totalScore } } },
        { $count: 'count' },
    ]).toArray();
    return rows.length > 0 ? rows[0].count : 0;
}

async function countProgramRegistrations(userId) {
    return (await main()).collection('program_registrations').countDocuments({ user_id: userId });
}

async function deleteCompletion(userId, lessonId) {
    if (!userId || !lessonId) return { deletedCount: 0 };
    const result = await (await main()).collection('lesson_completions').deleteMany({
        user_id: userId,
        $or: [{ lesson_id: lessonId }, { lessonId }],
    });
    return { deletedCount: result.deletedCount || 0 };
}

async function countUserPrograms(userId) {
    const userDoc = await (await main()).collection('users').findOne(
        { user_id: userId },
        { projection: { programs: 1 } }
    );
    return userDoc && Array.isArray(userDoc.programs) ? userDoc.programs.length : 0;
}

module.exports = {
    listCompletions,
    countAchievements,
    countHigherScorers,
    countProgramRegistrations,
    countUserPrograms,
    deleteCompletion,
};
