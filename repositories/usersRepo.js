const { getMainDb } = require('../config/database');
const { escapeSearchQuery } = require('../helpers/publicProfile');

const COLLECTION = 'users';

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

async function ensureIndexes() {
    await (await col()).createIndex(
        { handle: 1 },
        { unique: true, sparse: true, name: 'users_handle_unique' }
    );
    await (await col()).createIndex(
        { isPublicProfile: 1, handle: 1 },
        { name: 'users_public_handle' }
    );
}

async function findByUserId(userId) {
    return (await col()).findOne(
        { user_id: userId },
        { projection: { password_hash: 0 } }
    );
}

async function findByHandle(handle) {
    if (!handle) return null;
    return (await col()).findOne(
        { handle },
        { projection: { password_hash: 0, email: 0 } }
    );
}

async function findSafeByUserIds(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return [];
    return (await col()).find(
        { user_id: { $in: ids } },
        { projection: { password_hash: 0, email: 0 } }
    ).toArray();
}

async function searchPublic(query, limit = 8) {
    const q = String(query || '').trim().slice(0, 40);
    if (!q) return [];
    const safe = escapeSearchQuery(q);
    const cap = Math.min(Math.max(Number(limit) || 8, 1), 12);
    return (await col()).find(
        {
            isPublicProfile: true,
            handle: { $type: 'string', $ne: '' },
            $or: [
                { handle: { $regex: `^${safe}`, $options: 'i' } },
                { full_name: { $regex: safe, $options: 'i' } },
            ],
        },
        { projection: { password_hash: 0, email: 0 } }
    ).limit(cap).toArray();
}

async function handleTakenByOther(handle, userId) {
    const existing = await (await col()).findOne(
        { handle },
        { projection: { user_id: 1 } }
    );
    return Boolean(existing && existing.user_id !== userId);
}

async function updateIdentity(userId, patch) {
    const $set = { updated_at: new Date() };
    if (patch.full_name !== undefined) $set.full_name = patch.full_name;
    if (patch.handle !== undefined) $set.handle = patch.handle;
    if (patch.isPublicProfile !== undefined) $set.isPublicProfile = patch.isPublicProfile;
    if (patch.accentColor !== undefined) $set.accentColor = patch.accentColor;
    if (patch.avatarId !== undefined) $set.avatarId = patch.avatarId;
    if (patch.avatarFrame !== undefined) $set.avatarFrame = patch.avatarFrame;
    if (patch.nameplate !== undefined) $set.nameplate = patch.nameplate;
    if (patch.pinnedStatKey !== undefined) $set.pinnedStatKey = patch.pinnedStatKey;
    if (patch.onboardingCompletedAt !== undefined) $set.onboardingCompletedAt = patch.onboardingCompletedAt;
    if (patch.onboardingSkippedAt !== undefined) $set.onboardingSkippedAt = patch.onboardingSkippedAt;
    if (patch.onboardingBonusAwarded !== undefined) $set.onboardingBonusAwarded = patch.onboardingBonusAwarded;
    const result = await (await col()).findOneAndUpdate(
        { user_id: userId },
        { $set },
        { returnDocument: 'after', projection: { password_hash: 0 } }
    );
    return result.value || result;
}

const FCM_TOKEN_CAP = 8;

async function listFcmTokens(userId) {
    if (!userId) return [];
    const user = await (await col()).findOne(
        { user_id: userId },
        { projection: { fcmTokens: 1 } }
    );
    return [...new Set((user?.fcmTokens || []).map(String).filter(Boolean))];
}

async function addFcmToken(userId, token) {
    const value = String(token || '').trim();
    if (!userId || !value) return [];
    await (await col()).updateOne(
        { user_id: userId },
        {
            $addToSet: { fcmTokens: value },
            $set: { updated_at: new Date() },
        }
    );
    let tokens = await listFcmTokens(userId);
    if (tokens.length > FCM_TOKEN_CAP) {
        tokens = tokens.slice(-FCM_TOKEN_CAP);
        await (await col()).updateOne(
            { user_id: userId },
            { $set: { fcmTokens: tokens, updated_at: new Date() } }
        );
    }
    return tokens;
}

async function removeFcmToken(userId, token) {
    const value = String(token || '').trim();
    if (!userId || !value) return [];
    await (await col()).updateOne(
        { user_id: userId },
        {
            $pull: { fcmTokens: value },
            $set: { updated_at: new Date() },
        }
    );
    return listFcmTokens(userId);
}

async function countWithFcmTokens() {
    return (await col()).countDocuments({
        fcmTokens: { $exists: true, $not: { $size: 0 } },
    });
}

module.exports = {
    COLLECTION,
    ensureIndexes,
    findByUserId,
    findByHandle,
    findSafeByUserIds,
    searchPublic,
    handleTakenByOther,
    updateIdentity,
    listFcmTokens,
    addFcmToken,
    removeFcmToken,
    countWithFcmTokens,
    FCM_TOKEN_CAP,
};
