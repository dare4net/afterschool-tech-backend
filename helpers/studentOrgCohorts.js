const cohortMembershipsRepo = require('../repositories/cohortMembershipsRepo');
const cohortsRepo = require('../repositories/cohortsRepo');

/**
 * Attach each student's active cohort (if any) to their org membership rows.
 * Uses the latest active cohort membership per org.
 */
async function enrichOrgRowsWithStudentCohorts(userId, rows = []) {
    const uid = String(userId || '').trim();
    if (!uid || !Array.isArray(rows) || rows.length === 0) return rows;

    const cohortMemberships = await cohortMembershipsRepo.listByUser(uid, { status: 'active' });
    const cohortIdByOrg = new Map();
    for (const row of cohortMemberships) {
        const orgId = String(row.orgId);
        if (!cohortIdByOrg.has(orgId)) {
            cohortIdByOrg.set(orgId, String(row.cohortId));
        }
    }

    const cohortCache = new Map();
    async function cohortForOrg(orgId) {
        const cohortId = cohortIdByOrg.get(String(orgId));
        if (!cohortId) return null;
        if (cohortCache.has(cohortId)) return cohortCache.get(cohortId);
        const doc = await cohortsRepo.findById(cohortId);
        const cohort =
            doc && doc.status === 'active'
                ? { id: doc.id, name: doc.name, joinCode: doc.joinCode }
                : null;
        cohortCache.set(cohortId, cohort);
        return cohort;
    }

    const out = [];
    for (const row of rows) {
        if (row?.membership?.role !== 'student' || !row?.org?.id) {
            out.push(row);
            continue;
        }
        const cohort = await cohortForOrg(row.org.id);
        out.push(cohort ? { ...row, cohort } : row);
    }
    return out;
}

module.exports = {
    enrichOrgRowsWithStudentCohorts,
};
