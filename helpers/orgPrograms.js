const { getMainDb } = require('../config/database');
const { asOrgId } = require('./programVisibility');

function programTitle(row) {
    return String(row?.name || row?.program_name || 'Untitled').trim() || 'Untitled';
}

function orgIdMatch(orgId) {
    const orgOid = asOrgId(orgId);
    if (orgOid) {
        return { $in: [orgOid, String(orgOid), String(orgId).trim()] };
    }
    return String(orgId).trim();
}

async function listOrgPrograms(orgId) {
    const db = await getMainDb();
    const programs = await db.collection('programs')
        .find({
            org_id: orgIdMatch(orgId),
            is_deleted: { $ne: true },
        })
        .project({
            name: 1,
            program_name: 1,
            is_published: 1,
            tutor_id: 1,
            visibility: 1,
            created_at: 1,
        })
        .sort({ created_at: -1 })
        .toArray();

    return programs.map((row) => ({
        _id: row._id,
        name: programTitle(row),
        is_published: row.is_published,
        tutor_id: row.tutor_id,
        visibility: row.visibility || null,
        created_at: row.created_at,
    }));
}

module.exports = {
    listOrgPrograms,
    programTitle,
    orgIdMatch,
};
