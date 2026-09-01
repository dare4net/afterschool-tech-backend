const { ObjectId } = require('mongodb');
const { getMainDb } = require('../config/database');
const { normalizeJoinCode } = require('../helpers/joinCode');
const orgsRepo = require('./orgsRepo');

const COLLECTION = 'cohorts';

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

function asObjectId(value) {
    return orgsRepo.asObjectId(value);
}

function toPublicCohort(doc) {
    if (!doc) return null;
    return {
        id: String(doc._id),
        orgId: String(doc.org_id),
        name: doc.name,
        joinCode: doc.join_code,
        status: doc.status || 'active',
        programIds: (doc.program_ids || []).map(String),
        createdBy: doc.created_by || null,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
    };
}

async function ensureIndexes() {
    const collection = await col();
    await collection.createIndex(
        { join_code: 1 },
        { unique: true, name: 'cohorts_join_code_unique' }
    );
    await collection.createIndex({ org_id: 1, status: 1 }, { name: 'cohorts_org_status' });
}

async function create({
    orgId,
    name,
    joinCode,
    programIds = [],
    createdBy = null,
    status = 'active',
}) {
    const oid = asObjectId(orgId);
    const code = normalizeJoinCode(joinCode);
    const title = String(name || '').trim().slice(0, 120);
    if (!oid || !code || !title) {
        const err = new Error('orgId, name, and joinCode are required');
        err.code = 'invalid_cohort';
        throw err;
    }
    const programs = (programIds || [])
        .map((id) => asObjectId(id))
        .filter(Boolean);
    const now = new Date();
    const doc = {
        org_id: oid,
        name: title,
        join_code: code,
        status: status === 'archived' ? 'archived' : 'active',
        program_ids: programs,
        created_by: createdBy || null,
        created_at: now,
        updated_at: now,
    };
    await ensureIndexes();
    try {
        const result = await (await col()).insertOne(doc);
        return toPublicCohort({ ...doc, _id: result.insertedId });
    } catch (err) {
        if (err && err.code === 11000) {
            const conflict = new Error('Join code already in use');
            conflict.code = 'join_code_taken';
            throw conflict;
        }
        throw err;
    }
}

async function findById(cohortId) {
    const id = asObjectId(cohortId);
    if (!id) return null;
    return toPublicCohort(await (await col()).findOne({ _id: id }));
}

async function findByJoinCode(code) {
    const normalized = normalizeJoinCode(code);
    if (!normalized) return null;
    return toPublicCohort(await (await col()).findOne({
        join_code: normalized,
        status: 'active',
    }));
}

async function listByOrg(orgId, { status } = {}) {
    const id = asObjectId(orgId);
    if (!id) return [];
    const filter = { org_id: id };
    if (status) filter.status = status;
    const rows = await (await col()).find(filter).sort({ created_at: -1 }).toArray();
    return rows.map(toPublicCohort);
}

async function update(cohortId, patch = {}) {
    const id = asObjectId(cohortId);
    if (!id) return null;
    const $set = { updated_at: new Date() };
    if (patch.name !== undefined) $set.name = String(patch.name).trim().slice(0, 120);
    if (patch.status !== undefined) {
        if (!['active', 'archived'].includes(patch.status)) {
            const err = new Error('Invalid cohort status');
            err.code = 'invalid_status';
            throw err;
        }
        $set.status = patch.status;
    }
    if (patch.joinCode !== undefined) {
        const code = normalizeJoinCode(patch.joinCode);
        if (!code) {
            const err = new Error('Invalid join code');
            err.code = 'invalid_cohort';
            throw err;
        }
        $set.join_code = code;
    }
    if (patch.programIds !== undefined) {
        $set.program_ids = (patch.programIds || []).map((value) => asObjectId(value)).filter(Boolean);
    }
    try {
        const result = await (await col()).findOneAndUpdate(
            { _id: id },
            { $set },
            { returnDocument: 'after' }
        );
        return toPublicCohort(result.value || result);
    } catch (err) {
        if (err && err.code === 11000) {
            const conflict = new Error('Join code already in use');
            conflict.code = 'join_code_taken';
            throw conflict;
        }
        throw err;
    }
}

module.exports = {
    COLLECTION,
    toPublicCohort,
    ensureIndexes,
    create,
    findById,
    findByJoinCode,
    listByOrg,
    update,
};
