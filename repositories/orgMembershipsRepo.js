const { ObjectId } = require('mongodb');
const { getMainDb } = require('../config/database');
const { seatCountsForRole } = require('../helpers/orgSlug');
const orgsRepo = require('./orgsRepo');

const COLLECTION = 'org_memberships';
const ROLES = new Set(['owner', 'tutor', 'student']);
const STATUSES = new Set(['active', 'invited', 'removed']);

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

function asObjectId(value) {
    return orgsRepo.asObjectId(value);
}

function toPublicMembership(doc) {
    if (!doc) return null;
    return {
        id: String(doc._id),
        orgId: String(doc.org_id),
        userId: doc.user_id,
        role: doc.role,
        status: doc.status,
        seatCounts: doc.seat_counts === true,
        invitedBy: doc.invited_by || null,
        inviteEmail: doc.invite_email || null,
        inviteToken: doc.invite_token || null,
        joinedAt: doc.joined_at || null,
        createdAt: doc.created_at,
    };
}

async function ensureIndexes() {
    const collection = await col();
    await collection.createIndex(
        { org_id: 1, user_id: 1 },
        { unique: true, name: 'org_memberships_org_user_unique' }
    );
    await collection.createIndex({ user_id: 1, status: 1 }, { name: 'org_memberships_user_status' });
    await collection.createIndex(
        { org_id: 1, role: 1, status: 1 },
        { name: 'org_memberships_org_role_status' }
    );
    await collection.createIndex(
        { invite_token: 1 },
        { unique: true, sparse: true, name: 'org_memberships_invite_token' }
    );
}

async function upsertMember({
    orgId,
    userId,
    role,
    status = 'active',
    invitedBy = null,
    inviteEmail = null,
    inviteToken = null,
    seatCounts,
}) {
    const id = asObjectId(orgId);
    const uid = String(userId || '').trim();
    if (!id || !uid) {
        const err = new Error('orgId and userId are required');
        err.code = 'invalid_member';
        throw err;
    }
    if (!ROLES.has(role)) {
        const err = new Error('Invalid membership role');
        err.code = 'invalid_role';
        throw err;
    }
    if (!STATUSES.has(status)) {
        const err = new Error('Invalid membership status');
        err.code = 'invalid_status';
        throw err;
    }
    const now = new Date();
    const counts = seatCounts === undefined ? seatCountsForRole(role) : Boolean(seatCounts);
    await ensureIndexes();
    const $set = {
        role,
        status,
        seat_counts: counts,
        invited_by: invitedBy || null,
        updated_at: now,
    };
    if (inviteEmail !== undefined) $set.invite_email = inviteEmail;
    if (inviteToken !== undefined) $set.invite_token = inviteToken;
    if (status === 'active') $set.joined_at = now;

    const result = await (await col()).findOneAndUpdate(
        { org_id: id, user_id: uid },
        {
            $set,
            $setOnInsert: {
                org_id: id,
                user_id: uid,
                created_at: now,
            },
        },
        { upsert: true, returnDocument: 'after' }
    );
    return toPublicMembership(result.value || result);
}

async function findMembership(orgId, userId) {
    const id = asObjectId(orgId);
    const uid = String(userId || '').trim();
    if (!id || !uid) return null;
    return toPublicMembership(await (await col()).findOne({ org_id: id, user_id: uid }));
}

async function listByOrg(orgId, { status } = {}) {
    const id = asObjectId(orgId);
    if (!id) return [];
    const filter = { org_id: id };
    if (status) filter.status = status;
    const rows = await (await col()).find(filter).sort({ created_at: -1 }).toArray();
    return rows.map(toPublicMembership);
}

async function listByUser(userId, { status = 'active' } = {}) {
    const uid = String(userId || '').trim();
    if (!uid) return [];
    const filter = { user_id: uid };
    if (status) filter.status = status;
    const rows = await (await col()).find(filter).sort({ created_at: -1 }).toArray();
    return rows.map(toPublicMembership);
}

async function countSeats(orgId) {
    const id = asObjectId(orgId);
    if (!id) return 0;
    return (await col()).countDocuments({
        org_id: id,
        status: 'active',
        seat_counts: true,
    });
}

async function findByInviteToken(token) {
    const value = String(token || '').trim();
    if (!value) return null;
    // Include removed so a failed complete (remove-then-upsert) can still be recovered.
    return toPublicMembership(await (await col()).findOne({
        invite_token: value,
    }));
}

async function activateInvite(membershipId, userId, { keepInviteToken = true, seatCounts } = {}) {
    const id = asObjectId(membershipId);
    const uid = String(userId || '').trim();
    if (!id || !uid) return null;
    const now = new Date();
    const $set = {
        user_id: uid,
        status: 'active',
        joined_at: now,
        updated_at: now,
    };
    if (seatCounts !== undefined) {
        $set.seat_counts = Boolean(seatCounts);
    }
    const update = keepInviteToken
        ? { $set }
        : { $set, $unset: { invite_token: '' } };
    const result = await (await col()).findOneAndUpdate(
        { _id: id, status: { $in: ['invited', 'removed'] } },
        update,
        { returnDocument: 'after' }
    );
    return toPublicMembership(result.value || result);
}

async function removeMember(orgId, userId) {
    const id = asObjectId(orgId);
    const uid = String(userId || '').trim();
    if (!id || !uid) return null;
    const result = await (await col()).findOneAndUpdate(
        { org_id: id, user_id: uid },
        {
            $set: { status: 'removed', updated_at: new Date(), seat_counts: false },
            // Free the unique invite_token index so a replacement membership can reuse it.
            $unset: { invite_token: '' },
        },
        { returnDocument: 'after' }
    );
    return toPublicMembership(result.value || result);
}

async function setInviteToken(membershipId, inviteToken) {
    const id = asObjectId(membershipId);
    const token = String(inviteToken || '').trim();
    if (!id || !token) return null;
    const result = await (await col()).findOneAndUpdate(
        { _id: id, status: { $in: ['invited', 'active'] } },
        { $set: { invite_token: token, updated_at: new Date() } },
        { returnDocument: 'after' }
    );
    return toPublicMembership(result.value || result);
}

async function findPendingStaffInviteByEmail(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value) return null;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return toPublicMembership(await (await col()).findOne({
        invite_email: { $regex: `^${escaped}$`, $options: 'i' },
        status: 'invited',
        role: { $in: ['owner', 'tutor'] },
    }));
}

async function cancelInvite(membershipId) {
    const id = asObjectId(membershipId);
    if (!id) return null;
    const result = await (await col()).findOneAndUpdate(
        { _id: id, status: 'invited' },
        {
            $set: { status: 'removed', updated_at: new Date(), seat_counts: false },
            $unset: { invite_token: '' },
        },
        { returnDocument: 'after' }
    );
    return toPublicMembership(result.value || result);
}

module.exports = {
    COLLECTION,
    ROLES,
    STATUSES,
    toPublicMembership,
    ensureIndexes,
    upsertMember,
    findMembership,
    listByOrg,
    listByUser,
    countSeats,
    findByInviteToken,
    activateInvite,
    removeMember,
    setInviteToken,
    findPendingStaffInviteByEmail,
    cancelInvite,
};
