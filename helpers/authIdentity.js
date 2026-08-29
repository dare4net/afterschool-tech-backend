const jwt = require('jsonwebtoken');
const generateUserId = require('../utils/generateUserId');

function issueAuthToken(user) {
    if (!user || !user.user_id) {
        throw new Error('Cannot issue token without user_id');
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET must be set');
    }
    return jwt.sign(
        { user_id: user.user_id, role: user.account_type || user.role || 'student' },
        secret,
        { expiresIn: '7d' }
    );
}

/**
 * New social users get the same 6-character user_id as email signup.
 * Existing social rows that never received a user_id are backfilled.
 */
async function ensureCanonicalUserId(db, user, generateId = generateUserId) {
    if (user?.user_id) return user;
    const user_id = await generateId();
    await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { user_id } }
    );
    return { ...user, user_id };
}

async function findOrCreateSocialUser(db, { email, full_name, facebook_id, apple_sub }, { generateId = generateUserId } = {}) {
    let user = null;
    if (email) {
        user = await db.collection('users').findOne({ email });
    }
    if (!user && apple_sub) {
        user = await db.collection('users').findOne({ apple_sub });
    }
    if (!user && facebook_id) {
        user = await db.collection('users').findOne({ facebook_id });
    }

    if (user) {
        const patch = {};
        if (facebook_id && !user.facebook_id) patch.facebook_id = facebook_id;
        if (apple_sub && !user.apple_sub) patch.apple_sub = apple_sub;
        if (Object.keys(patch).length) {
            await db.collection('users').updateOne({ _id: user._id }, { $set: patch });
            user = { ...user, ...patch };
        }
        return ensureCanonicalUserId(db, user, generateId);
    }

    if (!email) {
        const err = new Error('Social account has no email');
        err.status = 400;
        throw err;
    }

    const user_id = await generateId();
    const userDoc = {
        user_id,
        email,
        account_type: 'student',
        full_name: full_name || null,
        facebook_id: facebook_id || null,
        apple_sub: apple_sub || null,
        created_at: new Date(),
    };
    const result = await db.collection('users').insertOne(userDoc);
    await db.collection('students').insertOne({
        user_id,
        email,
        full_name: full_name || '',
        created_at: new Date(),
    });
    return { ...userDoc, _id: result.insertedId };
}

module.exports = { issueAuthToken, ensureCanonicalUserId, findOrCreateSocialUser };
