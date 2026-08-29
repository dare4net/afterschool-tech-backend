const { getMainDb } = require('../config/database');
const { ObjectId } = require('mongodb');
const { getAuthenticatedUserId } = require('../helpers/actorUser');

/**
 * Helper to populate user details (name, avatar, email) from users collection
 * Supports matching both 5-character string user_id and 24-character hex ObjectId _id
 */
async function populateUserData(db, rawLeaderboard) {
    const rawIds = rawLeaderboard.map(item => item._id).filter(Boolean);
    if (!rawIds.length) return [];

    const objectIds = [];
    const stringUserIds = [];

    rawIds.forEach(id => {
        const strId = String(id);
        stringUserIds.push(strId);
        if (ObjectId.isValid(strId) && strId.length === 24) {
            try { objectIds.push(new ObjectId(strId)); } catch (e) { }
        }
    });

    // Query users collection using both user_id string and _id ObjectId
    const users = await db.collection('users').find({
        $or: [
            { user_id: { $in: stringUserIds } },
            { _id: { $in: objectIds.length ? objectIds : [new ObjectId()] } }
        ]
    }, { projection: { user_id: 1, full_name: 1, name: 1, email: 1, avatar: 1 } }).toArray();

    const userMap = {};
    users.forEach(u => {
        const displayName = u.full_name || u.name || (u.email ? u.email.split('@')[0] : null);
        const userData = { displayName, avatar: u.avatar || null, email: u.email || null };
        if (u.user_id) userMap[String(u.user_id)] = userData;
        if (u._id) userMap[u._id.toString()] = userData;
    });

    return rawLeaderboard.map((item, index) => {
        const key = String(item._id);
        const u = userMap[key] || {};
        const displayName = u.displayName || (u.email ? u.email.split('@')[0] : `Student ${key.slice(-4)}`);

        return {
            rank: index + 1,
            userId: key,
            name: displayName,
            avatar: u.avatar,
            email: u.email,
            totalScore: item.totalScore || 0,
            lessonsCompleted: item.lessonsCompleted || 0,
            lastActivityAt: item.lastActivityAt || null
        };
    });
}

/**
 * Get Global Leaderboard: top students platform-wide ranked by total first-attempt score
 */
exports.getGlobalLeaderboard = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const db = await getMainDb();

        const pipeline = [
            {
                $group: {
                    _id: '$user_id',
                    totalScore: { $sum: '$score' },
                    lessonsCompleted: { $sum: 1 },
                    lastActivityAt: { $max: '$completed_at' }
                }
            },
            { $sort: { totalScore: -1, lessonsCompleted: -1 } },
            { $limit: limit }
        ];

        const rawLeaderboard = await db.collection('lesson_completions').aggregate(pipeline).toArray();
        const ranked = await populateUserData(db, rawLeaderboard);

        res.json({
            success: true,
            type: 'global',
            count: ranked.length,
            leaderboard: ranked
        });
    } catch (err) {
        console.error('[LEADERBOARD] Error fetching global leaderboard:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Get Program Leaderboard: top students enrolled in a specific program
 */
exports.getProgramLeaderboard = async (req, res) => {
    try {
        const { programId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        if (!programId) {
            return res.status(400).json({ error: 'programId parameter is required' });
        }

        const db = await getMainDb();

        const pipeline = [
            { $match: { program_id: programId } },
            {
                $group: {
                    _id: '$user_id',
                    totalScore: { $sum: '$score' },
                    lessonsCompleted: { $sum: 1 },
                    lastActivityAt: { $max: '$completed_at' }
                }
            },
            { $sort: { totalScore: -1, lessonsCompleted: -1 } },
            { $limit: limit }
        ];

        const rawLeaderboard = await db.collection('lesson_completions').aggregate(pipeline).toArray();
        const ranked = await populateUserData(db, rawLeaderboard);

        res.json({
            success: true,
            type: 'program',
            programId,
            count: ranked.length,
            leaderboard: ranked
        });
    } catch (err) {
        console.error('[LEADERBOARD] Error fetching program leaderboard:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Get Personal Leaderboard: a user's own completed lesson scores over time
 */
exports.getPersonalLeaderboard = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const db = await getMainDb();

        const completions = await db.collection('lesson_completions')
            .find({ user_id: userId })
            .sort({ completed_at: -1 })
            .toArray();

        const totalScore = completions.reduce((acc, c) => acc + (c.score || 0), 0);

        // Fetch user name
        const userDoc = await db.collection('users').findOne({
            $or: [
                { user_id: String(userId) },
                ...(ObjectId.isValid(String(userId)) && String(userId).length === 24 ? [{ _id: new ObjectId(String(userId)) }] : [])
            ]
        });

        const name = userDoc?.full_name || userDoc?.name || (userDoc?.email ? userDoc.email.split('@')[0] : `Student ${String(userId).slice(-4)}`);

        res.json({
            success: true,
            type: 'personal',
            userId,
            name,
            totalScore,
            lessonsCompleted: completions.length,
            history: completions.map(c => ({
                lessonId: c.lesson_id,
                score: c.score,
                completedAt: c.completed_at
            }))
        });
    } catch (err) {
        console.error('[LEADERBOARD] Error fetching personal leaderboard:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
