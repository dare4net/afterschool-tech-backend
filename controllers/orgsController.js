const orgs = require('../helpers/orgs');
const cohorts = require('../helpers/cohorts');
const { listOrgPrograms } = require('../helpers/orgPrograms');
const { requireOrgStaff, requireOrgOwner, listStaffOrgs } = require('../helpers/orgAccess');

function mapOrgError(err, res) {
    const code = err && err.code;
    if (code === 'invalid_slug' || code === 'invalid_name' || code === 'invalid_status' || code === 'invalid_role' || code === 'invalid_member') {
        return res.status(400).json({ error: err.message, code });
    }
    if (code === 'slug_taken') {
        return res.status(409).json({ error: err.message, code });
    }
    if (code === 'owner_not_found' || code === 'org_not_found' || code === 'invite_not_found') {
        return res.status(404).json({ error: err.message, code });
    }
    if (code === 'seat_cap' || code === 'invite_email_mismatch' || code === 'account_exists' || code === 'invite_already_completed' || code === 'role_conflict_student' || code === 'staff_invite_pending') {
        return res.status(409).json({ error: err.message, code });
    }
    if (code === 'invalid_password' || code === 'invalid_cohort') {
        return res.status(400).json({ error: err.message, code });
    }
    if (code === 'org_forbidden') {
        return res.status(403).json({ error: err.message, code });
    }
    console.error('[ORGS]', err);
    return res.status(500).json({ error: 'Organisation request failed' });
}

exports.createOrg = async (req, res) => {
    try {
        const body = req.validatedBody || req.body || {};
        const result = await orgs.createOrg({
            name: body.name,
            slug: body.slug,
            seatCap: body.seatCap,
            status: body.status,
            ownerUserId: body.ownerUserId,
            ownerEmail: body.ownerEmail,
            actor: 'superadmin',
        });
        return res.status(201).json({ success: true, ...result });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.listOrgs = async (req, res) => {
    try {
        const items = await orgs.listOrgsWithSeats();
        return res.json({ success: true, orgs: items });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.getOrg = async (req, res) => {
    try {
        const org = await orgs.getOrgWithSeats(req.params.id);
        if (!org) return res.status(404).json({ error: 'Org not found' });
        const members = await orgs.listOrgMembers(req.params.id);
        const cohortList = await require('../helpers/cohorts').listCohorts(req.params.id);
        return res.json({ success: true, org, members, cohorts: cohortList });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.updateOrg = async (req, res) => {
    try {
        const body = req.validatedBody || req.body || {};
        const org = await orgs.updateOrg(req.params.id, body);
        if (!org) return res.status(404).json({ error: 'Org not found' });
        return res.json({ success: true, org });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.addMember = async (req, res) => {
    try {
        const body = req.validatedBody || req.body || {};
        const result = await orgs.addMember({
            orgId: req.params.id,
            userId: body.userId,
            email: body.email,
            role: body.role || 'tutor',
            invitedBy: 'superadmin',
        });
        return res.status(result.created ? 201 : 200).json({ success: true, ...result });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.getPublicOrgBySlug = async (req, res) => {
    try {
        const orgsRepo = require('../repositories/orgsRepo');
        const { normalizeOrgSlug } = require('../helpers/orgSlug');
        const slug = normalizeOrgSlug(req.params.slug);
        if (!slug) return res.status(404).json({ error: 'Club not found', code: 'org_not_found' });

        const org = await orgsRepo.findBySlug(slug);
        if (!org || org.status !== 'active' || org.settings?.vanityEnabled !== true) {
            return res.status(404).json({ error: 'Club not found', code: 'org_not_found' });
        }

        return res.json({
            success: true,
            org: {
                id: org.id,
                name: org.name,
                slug: org.slug,
            },
        });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.listMyOrgs = async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const itemsRaw = await orgs.listMyOrgs(userId);
        const items = await require('../helpers/studentOrgCohorts').enrichOrgRowsWithStudentCohorts(
            userId,
            itemsRaw,
        );
        const staff = listStaffOrgs(items);
        const studentOrgs = (items || []).filter(
            (row) => row.membership && row.membership.role === 'student',
        );
        const usersRepo = require('../repositories/usersRepo');
        const curriculumRepo = require('../repositories/curriculumRepo');
        const user = await usersRepo.findByUserId(userId);
        const publicAccess = user && user.public_access === true;

        const personalCount = await curriculumRepo.countActiveRegistrations(userId, { orgScope: 'personal' });
        let hasPersonalPrograms = personalCount > 0;
        // Legacy denorm: users.programs may predate org_id on registrations
        if (!hasPersonalPrograms && Array.isArray(user?.programs) && user.programs.length > 0) {
            const clubRegCount = await curriculumRepo.countActiveRegistrations(userId, { orgScope: 'club' });
            hasPersonalPrograms = clubRegCount === 0 || user.programs.length > clubRegCount;
        }

        return res.json({
            success: true,
            orgs: items,
            staffOrgs: staff,
            studentOrgs,
            clubMode: studentOrgs.length > 0,
            publicAccess,
            hasPersonalPrograms,
            hybridMode: studentOrgs.length > 0 && hasPersonalPrograms,
        });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.getMyOrg = async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { org, membership } = await requireOrgStaff(req.params.id, userId);
        const withSeats = await orgs.getOrgWithSeats(org.id);
        const members = await orgs.listOrgMembers(org.id);
        const cohortList = await cohorts.listCohorts(org.id);
        return res.json({
            success: true,
            org: withSeats,
            membership,
            members,
            cohorts: cohortList,
        });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.listOrgPrograms = async (req, res) => {
    try {
        const orgId = req.params.id;
        if (!req.superadmin) {
            const userId = req.user && req.user.user_id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            await requireOrgStaff(orgId, userId);
        }
        const programs = await listOrgPrograms(orgId);
        return res.json({ success: true, programs });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.updateMyOrg = async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        await requireOrgOwner(req.params.id, userId);
        const body = req.validatedBody || req.body || {};
        const org = await orgs.updateOrg(req.params.id, {
            settings: {
                allowPublicOptIn: body.settings.allowPublicOptIn,
            },
        });
        if (!org) return res.status(404).json({ error: 'Org not found' });
        return res.json({ success: true, org });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.addMyOrgMember = async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const body = req.validatedBody || req.body || {};
        const role = body.role || 'tutor';
        if (role === 'owner' || role === 'tutor') {
            await requireOrgOwner(req.params.id, userId);
        } else {
            await requireOrgStaff(req.params.id, userId);
        }
        const result = await orgs.addMember({
            orgId: req.params.id,
            userId: body.userId,
            email: body.email,
            role,
            invitedBy: userId,
        });
        return res.status(result.created ? 201 : 200).json({ success: true, ...result });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.acceptInvite = async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const body = req.validatedBody || req.body || {};
        const membership = await orgs.acceptInvite({
            token: body.token,
            userId,
            email: req.user.email,
        });
        const org = await orgs.getOrgWithSeats(membership.orgId);
        return res.json({ success: true, membership, org });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.previewInvite = async (req, res) => {
    try {
        const preview = await orgs.previewInvite(req.params.token);
        return res.json({ success: true, ...preview });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.completeInvite = async (req, res) => {
    try {
        const body = req.validatedBody || req.body || {};
        const result = await orgs.completeInvite({
            token: req.params.token,
            fullName: body.fullName,
            password: body.password,
            cohortName: body.cohortName,
        });
        return res.status(201).json({ success: true, ...result });
    } catch (err) {
        return mapOrgError(err, res);
    }
};

exports.cancelInvite = async (req, res) => {
    try {
        const asSuperadmin = Boolean(req.superadmin);
        const userId = req.user && req.user.user_id;
        const cancelled = await orgs.cancelInvite({
            orgId: req.params.id,
            membershipId: req.params.memberId,
            actorUserId: userId,
            asSuperadmin,
        });
        return res.json({ success: true, membership: cancelled });
    } catch (err) {
        return mapOrgError(err, res);
    }
};
