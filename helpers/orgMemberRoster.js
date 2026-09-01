const cohortMembershipsRepo = require('../repositories/cohortMembershipsRepo');
const cohortsRepo = require('../repositories/cohortsRepo');

/**
 * Attach active cohort (if any) to each student member row for org people UI.
 */
async function enrichMembersWithCohorts(orgId, members = []) {
    if (!orgId || !Array.isArray(members) || members.length === 0) return members;

    const cohortCache = new Map();
    async function cohortSummary(cohortId) {
        const key = String(cohortId);
        if (cohortCache.has(key)) return cohortCache.get(key);
        const doc = await cohortsRepo.findById(key);
        const summary =
            doc && doc.status === 'active'
                ? { id: doc.id, name: doc.name, joinCode: doc.joinCode }
                : null;
        cohortCache.set(key, summary);
        return summary;
    }

    const out = [];
    for (const member of members) {
        if (member.role !== 'student' || member.status !== 'active' || !member.userId) {
            out.push(member);
            continue;
        }
        const active = await cohortMembershipsRepo.listActiveForOrgUser(orgId, member.userId);
        const cohort = active[0] ? await cohortSummary(active[0].cohortId) : null;
        out.push(cohort ? { ...member, cohort } : member);
    }
    return out;
}

module.exports = {
    enrichMembersWithCohorts,
};
