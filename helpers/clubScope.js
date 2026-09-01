const { getActiveMembership } = require('./orgAccess');
const cohortMembershipsRepo = require('../repositories/cohortMembershipsRepo');
const orgMembershipsRepo = require('../repositories/orgMembershipsRepo');
const orgsRepo = require('../repositories/orgsRepo');

/**
 * Decide cohort vs org-wide pride/people scope from org setting and membership.
 * - `org` → always org-wide (owner chose club-wide boards)
 * - `cohort` → cohort peers when enrolled, else org-wide fallback
 */
function resolvePrideScopeMode(orgPrideScope, hasCohortMembership) {
    if (orgPrideScope === 'org') return 'org';
    if (hasCohortMembership) return 'cohort';
    return 'org';
}

async function cohortScopeForOrg({ orgId, viewerId, cohortId }) {
    const peers = await cohortMembershipsRepo.listByCohort(cohortId, { status: 'active' });
    const userIds = [...new Set((peers || []).map((row) => row.userId).filter(Boolean))];
    if (!userIds.includes(String(viewerId))) userIds.push(String(viewerId));
    return {
        type: 'cohort',
        orgId: String(orgId),
        cohortId: String(cohortId),
        userIds,
        requireListed: false,
    };
}

async function orgWideScopeForOrg({ orgId, viewerId }) {
    const members = await orgMembershipsRepo.listByOrg(orgId, { status: 'active' });
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
        orgId: String(orgId),
        cohortId: null,
        userIds,
        requireListed: false,
    };
}

/**
 * Resolve who appears on club-scoped pride / people search.
 * - personal / missing → global (userIds null)
 * - org prideScope `org` → all active student org members
 * - org prideScope `cohort` → cohort peers when enrolled, else org-wide fallback
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

    const org = await orgsRepo.findById(raw);
    const orgPrideScope = org?.settings?.prideScope === 'cohort' ? 'cohort' : 'org';

    const myCohorts = await cohortMembershipsRepo.listByUser(viewerId, { status: 'active' });
    const forOrg = (myCohorts || []).filter((row) => String(row.orgId) === String(raw));
    const hasCohort = Boolean(forOrg[0]);
    const mode = resolvePrideScopeMode(orgPrideScope, hasCohort);

    if (mode === 'cohort' && forOrg[0]) {
        return cohortScopeForOrg({
            orgId: raw,
            viewerId,
            cohortId: forOrg[0].cohortId,
        });
    }

    return orgWideScopeForOrg({ orgId: raw, viewerId });
}

function parseOrgIdQuery(query) {
    if (!query || query.org_id == null) return '';
    return String(query.org_id).trim();
}

module.exports = {
    resolveClubScope,
    resolvePrideScopeMode,
    parseOrgIdQuery,
};
