const { getActiveMembership } = require('./orgAccess');
const cohortMembershipsRepo = require('../repositories/cohortMembershipsRepo');
const orgMembershipsRepo = require('../repositories/orgMembershipsRepo');

/**
 * Resolve who appears on club-scoped pride / people search.
 * - personal / missing → global (userIds null)
 * - prefer viewer's latest active cohort peers
 * - else active student org members
 */
async function resolveClubScope({ orgId, viewerId } = {}) {
    const raw = String(orgId || '').trim();
    if (!raw || raw === 'personal') {
        return {
            type: 'global',
            orgId: null,
            cohortId: null,
            userIds: null,
            requireListed: true,
        };
    }

    if (!viewerId) {
        const err = new Error('Sign in required for club boards');
        err.code = 'unauthorized';
        throw err;
    }

    const membership = await getActiveMembership(raw, viewerId);
    if (!membership) {
        const err = new Error('Forbidden');
        err.code = 'org_forbidden';
        throw err;
    }

    const myCohorts = await cohortMembershipsRepo.listByUser(viewerId, { status: 'active' });
    const forOrg = (myCohorts || []).filter((row) => String(row.orgId) === String(raw));
    if (forOrg[0]) {
        const peers = await cohortMembershipsRepo.listByCohort(forOrg[0].cohortId, { status: 'active' });
        const userIds = [...new Set((peers || []).map((row) => row.userId).filter(Boolean))];
        if (!userIds.includes(String(viewerId))) userIds.push(String(viewerId));
        return {
            type: 'cohort',
            orgId: String(raw),
            cohortId: String(forOrg[0].cohortId),
            userIds,
            requireListed: false,
        };
    }

    const members = await orgMembershipsRepo.listByOrg(raw, { status: 'active' });
    const userIds = [
        ...new Set(
            (members || [])
                .filter((row) => row.role === 'student' || String(row.userId) === String(viewerId))
                .map((row) => row.userId)
                .filter(Boolean)
        ),
    ];
    if (!userIds.includes(String(viewerId))) userIds.push(String(viewerId));

    return {
        type: 'org',
        orgId: String(raw),
        cohortId: null,
        userIds,
        requireListed: false,
    };
}

function parseOrgIdQuery(query) {
    if (!query || query.org_id == null) return '';
    return String(query.org_id).trim();
}

module.exports = {
    resolveClubScope,
    parseOrgIdQuery,
};
