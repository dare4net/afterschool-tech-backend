const orgMembershipsRepo = require('../repositories/orgMembershipsRepo');
const orgsRepo = require('../repositories/orgsRepo');

const STAFF_ROLES = new Set(['owner', 'tutor']);
const OWNER_ROLES = new Set(['owner']);

async function getActiveMembership(orgId, userId) {
    const membership = await orgMembershipsRepo.findMembership(orgId, userId);
    if (!membership || membership.status !== 'active') return null;
    return membership;
}

async function requireOrgStaff(orgId, userId) {
    const membership = await getActiveMembership(orgId, userId);
    if (!membership || !STAFF_ROLES.has(membership.role)) {
        const err = new Error('Forbidden');
        err.code = 'org_forbidden';
        throw err;
    }
    const org = await orgsRepo.findById(orgId);
    if (!org) {
        const err = new Error('Org not found');
        err.code = 'org_not_found';
        throw err;
    }
    return { org, membership };
}

async function requireOrgOwner(orgId, userId) {
    const { org, membership } = await requireOrgStaff(orgId, userId);
    if (!OWNER_ROLES.has(membership.role)) {
        const err = new Error('Owner role required');
        err.code = 'org_forbidden';
        throw err;
    }
    return { org, membership };
}

function listStaffOrgs(items) {
    return (items || []).filter(
        (row) => row.membership && STAFF_ROLES.has(row.membership.role)
    );
}

module.exports = {
    STAFF_ROLES,
    OWNER_ROLES,
    getActiveMembership,
    requireOrgStaff,
    requireOrgOwner,
    listStaffOrgs,
};
