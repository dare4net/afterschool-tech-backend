const { getMainDb } = require('../config/database');
const orgsRepo = require('./orgsRepo');

const COLLECTION = 'cohort_memberships';

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

function asObjectId(value) {
    return orgsRepo.asObjectId(value);
}

function toPublic(doc) {
    if (!doc) return null;
    return {
        id: String(doc._id),
        cohortId: String(doc.cohort_id),
        orgId: String(doc.org_id),
        userId: doc.user_id,
        status: doc.status,
        joinedAt: doc.joined_at,
        createdAt: doc.created_at,
    };
}

async function ensureIndexes() {
    const collection = await col();
    await collection.createIndex(
        { cohort_id: 1, user_id: 1 },
        { unique: true, name: 'cohort_memberships_unique' }
    );
    await collection.createIndex({ user_id: 1, status: 1 }, { name: 'cohort_memberships_user_status' });
    await collection.createIndex({ org_id: 1, status: 1 }, { name: 'cohort_memberships_org_status' });
}

async function upsert({ cohortId, orgId, userId, status = 'active' }) {
    const cid = asObjectId(cohortId);
    const oid = asObjectId(orgId);
    const uid = String(userId || '').trim();
    if (!cid || !oid || !uid) {
        const err = new Error('cohortId, orgId, and userId are required');
        err.code = 'invalid_cohort_member';
        throw err;
    }
    const now = new Date();
    await ensureIndexes();
    const result = await (await col()).findOneAndUpdate(
        { cohort_id: cid, user_id: uid },
        {
            $set: {
                org_id: oid,
                status,
                joined_at: now,
                updated_at: now,
            },
            $setOnInsert: {
                cohort_id: cid,
                user_id: uid,
                created_at: now,
            },
        },
        { upsert: true, returnDocument: 'after' }
    );
    return toPublic(result.value || result);
}

async function find(cohortId, userId) {
    const cid = asObjectId(cohortId);
    const uid = String(userId || '').trim();
    if (!cid || !uid) return null;
    return toPublic(await (await col()).findOne({ cohort_id: cid, user_id: uid }));
}

async function listByCohort(cohortId, { status = 'active' } = {}) {
    const cid = asObjectId(cohortId);
    if (!cid) return [];
    const filter = { cohort_id: cid };
    if (status) filter.status = status;
    const rows = await (await col()).find(filter).sort({ joined_at: -1 }).toArray();
    return rows.map(toPublic);
}

async function listByUser(userId, { status = 'active' } = {}) {
    const uid = String(userId || '').trim();
    if (!uid) return [];
    const filter = { user_id: uid };
    if (status) filter.status = status;
    const rows = await (await col()).find(filter).sort({ joined_at: -1 }).toArray();
    return rows.map(toPublic);
}

async function countByCohort(cohortId) {
    const cid = asObjectId(cohortId);
    if (!cid) return 0;
    return (await col()).countDocuments({ cohort_id: cid, status: 'active' });
}

async function listActiveForOrgUser(orgId, userId) {
    const oid = asObjectId(orgId);
    const uid = String(userId || '').trim();
    if (!oid || !uid) return [];
    const rows = await (await col())
        .find({ org_id: oid, user_id: uid, status: 'active' })
        .sort({ joined_at: -1 })
        .toArray();
    return rows.map(toPublic);
}

async function deactivateForOrgUser(orgId, userId, { exceptCohortId } = {}) {
    const oid = asObjectId(orgId);
    const uid = String(userId || '').trim();
    if (!oid || !uid) return 0;
    const filter = { org_id: oid, user_id: uid, status: 'active' };
    const exceptId = exceptCohortId ? asObjectId(exceptCohortId) : null;
    if (exceptId) filter.cohort_id = { $ne: exceptId };
    const result = await (await col()).updateMany(filter, {
        $set: { status: 'removed', updated_at: new Date() },
    });
    return result.modifiedCount || 0;
}

module.exports = {
    COLLECTION,
    ensureIndexes,
    upsert,
    find,
    listByCohort,
    listByUser,
    countByCohort,
    listActiveForOrgUser,
    deactivateForOrgUser,
};
