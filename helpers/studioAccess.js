const { ObjectId } = require('mongodb');
const orgMembershipsRepo = require('../repositories/orgMembershipsRepo');
const { asOrgId } = require('./programVisibility');
const { STAFF_ROLES, OWNER_ROLES } = require('./orgAccess');

const STUDIO_ROLES = new Set(['tutor', 'teacher', 'admin', 'organization', 'org']);

function isStudioRole(role) {
    return STUDIO_ROLES.has(String(role || '').trim().toLowerCase());
}

function toObjectId(id) {
    try {
        return new ObjectId(id);
    } catch {
        return null;
    }
}

function tutorIdQuery(userId) {
    const uid = String(userId || '').trim();
    const userObjId = toObjectId(uid);
    return userObjId ? { $in: [uid, userObjId] } : uid;
}

function orgIdVariants(orgId) {
    const oid = asOrgId(orgId);
    if (!oid) return [String(orgId)];
    return [oid, String(oid), String(orgId)];
}

function programBelongsToOrg(programOrgId, orgId) {
    if (!programOrgId || !orgId) return false;
    const variants = new Set(orgIdVariants(orgId).map(String));
    return variants.has(String(programOrgId));
}

async function getStaffContext(userId) {
    const memberships = await orgMembershipsRepo.listByUser(userId, { status: 'active' });
    const staff = memberships.filter((row) => STAFF_ROLES.has(row.role));
    const ownerOrgIds = staff.filter((row) => OWNER_ROLES.has(row.role)).map((row) => row.orgId);
    return { staff, ownerOrgIds };
}

async function canEditProgram(program, userId, staffCtx = null) {
    if (!program) return false;
    const uid = String(userId || '').trim();
    if (String(program.tutor_id || '') === uid) return true;
    if (!program.org_id) return false;

    const ctx = staffCtx || (await getStaffContext(userId));
    return ctx.ownerOrgIds.some((orgId) => programBelongsToOrg(program.org_id, orgId));
}

async function findProgramForEditor(db, programId, userId) {
    const programObjectId = toObjectId(programId);
    if (!programObjectId) return null;

    const program = await db.collection('programs').findOne({
        _id: programObjectId,
        is_deleted: { $ne: true },
    });
    if (!program) return null;
    if (!(await canEditProgram(program, userId))) return null;
    return program;
}

async function findAccessiblePrograms(db, userId) {
    const ctx = await getStaffContext(userId);
    const ownerOrgMatches = ctx.ownerOrgIds.flatMap((id) => orgIdVariants(id));
    const or = [{ tutor_id: tutorIdQuery(userId) }];
    if (ownerOrgMatches.length > 0) {
        or.push({ org_id: { $in: ownerOrgMatches } });
    }
    return db.collection('programs')
        .find({
            is_deleted: { $ne: true },
            $or: or,
        })
        .toArray();
}

async function findAccessibleProgramIds(db, userId) {
    const programs = await findAccessiblePrograms(db, userId);
    return programs.map((row) => row._id);
}

module.exports = {
    STUDIO_ROLES,
    isStudioRole,
    tutorIdQuery,
    orgIdVariants,
    programBelongsToOrg,
    getStaffContext,
    canEditProgram,
    findProgramForEditor,
    findAccessiblePrograms,
    findAccessibleProgramIds,
};
