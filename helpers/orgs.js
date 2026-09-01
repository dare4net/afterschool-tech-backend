const crypto = require('crypto');
const bcrypt = require('bcrypt');
const defaultOrgsRepo = require('../repositories/orgsRepo');
const defaultOrgMembershipsRepo = require('../repositories/orgMembershipsRepo');
const defaultUsersRepo = require('../repositories/usersRepo');
const defaultCohorts = require('./cohorts');
const { slugifyOrgName, normalizeOrgSlug, seatCountsForRole } = require('./orgSlug');
const { issueAuthToken } = require('./authIdentity');
const generateUserId = require('../utils/generateUserId');
const { getMainDb } = require('../config/database');

function makeInviteToken() {
    return crypto.randomBytes(24).toString('hex');
}

function createOrgsService({
    orgsRepo = defaultOrgsRepo,
    orgMembershipsRepo = defaultOrgMembershipsRepo,
    usersRepo = defaultUsersRepo,
    cohortsService = defaultCohorts,
    hashPassword = (password) => bcrypt.hash(password, 10),
    createUserId = generateUserId,
    insertLocalUser = null,
    issueToken = issueAuthToken,
} = {}) {
    async function defaultInsertLocalUser({ email, passwordHash, fullName, accountType }) {
        const db = await getMainDb();
        const user_id = await createUserId();
        const userDoc = {
            user_id,
            email,
            password_hash: passwordHash,
            account_type: accountType,
            full_name: fullName || null,
            created_at: new Date(),
        };
        await db.collection('users').insertOne(userDoc);
        await db.collection(`${accountType}s`).insertOne({
            user_id,
            email,
            full_name: fullName || '',
            created_at: new Date(),
        });
        return userDoc;
    }

    const writeLocalUser = insertLocalUser || defaultInsertLocalUser;

    async function withSeatUsage(org) {
        if (!org) return null;
        const seatsUsed = await orgMembershipsRepo.countSeats(org.id);
        return {
            ...org,
            seatsUsed,
            seatsRemaining: Math.max(0, (Number(org.seatCap) || 0) - seatsUsed),
        };
    }

    async function createOrg({
        name,
        slug,
        seatCap = 40,
        status = 'active',
        ownerUserId = null,
        ownerEmail = null,
        actor = null,
    } = {}) {
        const resolvedSlug = normalizeOrgSlug(slug) || normalizeOrgSlug(slugifyOrgName(name));
        const org = await orgsRepo.create({
            name,
            slug: resolvedSlug,
            seatCap,
            status,
        });

        let owner = null;
        if (ownerUserId) {
            const user = await usersRepo.findByUserId(ownerUserId);
            if (!user) {
                const err = new Error('Owner user not found');
                err.code = 'owner_not_found';
                throw err;
            }
            owner = await orgMembershipsRepo.upsertMember({
                orgId: org.id,
                userId: user.user_id,
                role: 'owner',
                status: 'active',
                invitedBy: actor,
                inviteEmail: user.email || null,
                inviteToken: makeInviteToken(),
                seatCounts: false,
            });
        } else if (ownerEmail) {
            const email = String(ownerEmail).trim().toLowerCase();
            const existing = await usersRepo.findByEmail(email);
            if (existing) {
                const accountType = String(existing.account_type || '').toLowerCase();
                if (accountType === 'student') {
                    const err = new Error('That email is a student account and cannot be an organisation owner');
                    err.code = 'role_conflict_student';
                    throw err;
                }
                owner = await orgMembershipsRepo.upsertMember({
                    orgId: org.id,
                    userId: existing.user_id,
                    role: 'owner',
                    status: 'active',
                    invitedBy: actor,
                    inviteEmail: email,
                    inviteToken: makeInviteToken(),
                    seatCounts: false,
                });
            } else {
                const pendingKey = `invite:${org.id}:${email}`;
                owner = await orgMembershipsRepo.upsertMember({
                    orgId: org.id,
                    userId: pendingKey,
                    role: 'owner',
                    status: 'invited',
                    invitedBy: actor,
                    inviteEmail: email,
                    inviteToken: makeInviteToken(),
                    seatCounts: false,
                });
            }
        }

        return {
            org: await withSeatUsage(org),
            owner,
        };
    }

    async function listOrgsWithSeats() {
        const orgs = await orgsRepo.list();
        return Promise.all(orgs.map(withSeatUsage));
    }

    async function getOrgWithSeats(orgId) {
        return withSeatUsage(await orgsRepo.findById(orgId));
    }

    async function updateOrg(orgId, patch) {
        const org = await orgsRepo.update(orgId, patch);
        return withSeatUsage(org);
    }

    async function addMember({
        orgId,
        userId = null,
        email = null,
        role = 'tutor',
        invitedBy = null,
    } = {}) {
        if (!['owner', 'tutor', 'student'].includes(role)) {
            const err = new Error('Invalid role');
            err.code = 'invalid_role';
            throw err;
        }

        const org = await orgsRepo.findById(orgId);
        if (!org) {
            const err = new Error('Org not found');
            err.code = 'org_not_found';
            throw err;
        }

        let user = null;
        if (userId) user = await usersRepo.findByUserId(userId);
        else if (email) user = await usersRepo.findByEmail(String(email).trim().toLowerCase());

        if ((role === 'owner' || role === 'tutor') && user) {
            const accountType = String(user.account_type || '').toLowerCase();
            if (accountType === 'student') {
                const err = new Error('Student accounts cannot be added as club tutors or owners');
                err.code = 'role_conflict_student';
                throw err;
            }
        }

        if (role === 'student') {
            const seatsUsed = await orgMembershipsRepo.countSeats(org.id);
            if (seatsUsed >= org.seatCap) {
                const err = new Error('Org seat cap reached');
                err.code = 'seat_cap';
                throw err;
            }
        }

        if (user) {
            const existing = await orgMembershipsRepo.findMembership(org.id, user.user_id);
            if (existing && existing.status === 'active') {
                return { membership: existing, created: false };
            }
            const membership = await orgMembershipsRepo.upsertMember({
                orgId: org.id,
                userId: user.user_id,
                role,
                status: 'active',
                invitedBy,
                inviteEmail: user.email || email || null,
                inviteToken: null,
                seatCounts: seatCountsForRole(role),
            });
            return { membership, created: true };
        }

        if (!email) {
            const err = new Error('userId or email is required');
            err.code = 'invalid_member';
            throw err;
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const pendingKey = `invite:${org.id}:${normalizedEmail}`;
        const membership = await orgMembershipsRepo.upsertMember({
            orgId: org.id,
            userId: pendingKey,
            role,
            status: 'invited',
            invitedBy,
            inviteEmail: normalizedEmail,
            inviteToken: makeInviteToken(),
            seatCounts: false,
        });
        return { membership, created: true };
    }

    async function listOrgMembers(orgId) {
        const members = await orgMembershipsRepo.listByOrg(orgId);
        const out = [];
        for (const member of members) {
            if (
                member
                && (member.role === 'owner' || member.role === 'tutor')
                && (member.status === 'invited' || member.status === 'active')
                && !member.inviteToken
                && typeof orgMembershipsRepo.setInviteToken === 'function'
            ) {
                const token = makeInviteToken();
                const updated = await orgMembershipsRepo.setInviteToken(member.id, token);
                out.push(updated || { ...member, inviteToken: token });
            } else {
                out.push(member);
            }
        }
        return out;
    }

    async function listMyOrgs(userId) {
        const memberships = await orgMembershipsRepo.listByUser(userId, { status: 'active' });
        const out = [];
        for (const membership of memberships) {
            const org = await withSeatUsage(await orgsRepo.findById(membership.orgId));
            if (!org) continue;
            out.push({ org, membership });
        }
        return out;
    }

    async function cancelInvite({ orgId, membershipId, actorUserId = null, asSuperadmin = false } = {}) {
        const members = await orgMembershipsRepo.listByOrg(orgId);
        const target = members.find((row) => row.id === membershipId);
        if (!target || target.status !== 'invited') {
            const err = new Error('Invite not found');
            err.code = 'invite_not_found';
            throw err;
        }
        if (!asSuperadmin) {
            if (!actorUserId) {
                const err = new Error('Forbidden');
                err.code = 'org_forbidden';
                throw err;
            }
            await require('./orgAccess').requireOrgOwner(orgId, actorUserId);
        }
        const cancelled = await orgMembershipsRepo.cancelInvite(membershipId);
        if (!cancelled) {
            const err = new Error('Invite not found');
            err.code = 'invite_not_found';
            throw err;
        }
        return cancelled;
    }

    async function assertStudentSignupAllowed(email) {
        const pending = await orgMembershipsRepo.findPendingStaffInviteByEmail(email);
        if (pending) {
            const err = new Error(
                'This email has a club staff invite. Finish or cancel that invite before creating a student account.'
            );
            err.code = 'staff_invite_pending';
            throw err;
        }
    }

    async function previewInvite(token) {
        const invite = await orgMembershipsRepo.findByInviteToken(token);
        if (!invite) {
            const err = new Error('Invite not found');
            err.code = 'invite_not_found';
            throw err;
        }
        const org = await withSeatUsage(await orgsRepo.findById(invite.orgId));
        if (!org) {
            const err = new Error('Org not found');
            err.code = 'org_not_found';
            throw err;
        }
        return {
            org: {
                id: org.id,
                name: org.name,
                slug: org.slug,
                status: org.status,
            },
            inviteEmail: invite.inviteEmail,
            role: invite.role,
            status: invite.status,
            needsOnboarding: invite.status === 'invited' || invite.status === 'removed',
        };
    }

    async function acceptInvite({ token, userId, email }) {
        const invite = await orgMembershipsRepo.findByInviteToken(token);
        if (!invite) {
            const err = new Error('Invite not found');
            err.code = 'invite_not_found';
            throw err;
        }
        if (invite.status === 'active' && invite.userId === userId) {
            return invite;
        }
        if (invite.inviteEmail && email) {
            if (String(invite.inviteEmail).toLowerCase() !== String(email).toLowerCase()) {
                const err = new Error('Invite email does not match this account');
                err.code = 'invite_email_mismatch';
                throw err;
            }
        }

        const existing = await orgMembershipsRepo.findMembership(invite.orgId, userId);
        if (existing && existing.status === 'active') {
            if (invite.userId !== userId && invite.status !== 'active') {
                await orgMembershipsRepo.removeMember(invite.orgId, invite.userId);
            }
            return existing;
        }

        if (invite.role === 'student') {
            const org = await orgsRepo.findById(invite.orgId);
            if (!org) {
                const err = new Error('Org not found');
                err.code = 'org_not_found';
                throw err;
            }
            const seatsUsed = await orgMembershipsRepo.countSeats(org.id);
            if (seatsUsed >= org.seatCap) {
                const err = new Error('Org seat cap reached');
                err.code = 'seat_cap';
                throw err;
            }
        }

        if (invite.status === 'invited' || invite.status === 'removed') {
            const claimed = await orgMembershipsRepo.activateInvite(invite.id, userId, {
                keepInviteToken: true,
                seatCounts: seatCountsForRole(invite.role),
            });
            if (claimed) return claimed;
        }

        return orgMembershipsRepo.upsertMember({
            orgId: invite.orgId,
            userId,
            role: invite.role,
            status: 'active',
            invitedBy: invite.invitedBy,
            inviteEmail: invite.inviteEmail,
            inviteToken: invite.inviteToken,
            seatCounts: seatCountsForRole(invite.role),
        });
    }

    async function completeInvite({
        token,
        fullName,
        password,
        cohortName,
    }) {
        const invite = await orgMembershipsRepo.findByInviteToken(token);
        if (!invite) {
            const err = new Error('Invite not found');
            err.code = 'invite_not_found';
            throw err;
        }
        if (invite.status === 'active') {
            const err = new Error('Invite already completed — sign in with your password');
            err.code = 'invite_already_completed';
            throw err;
        }
        if (!['owner', 'tutor'].includes(invite.role)) {
            const err = new Error('This invite cannot be completed here');
            err.code = 'invalid_role';
            throw err;
        }

        const email = String(invite.inviteEmail || '').trim().toLowerCase();
        if (!email) {
            const err = new Error('Invite has no email');
            err.code = 'invalid_member';
            throw err;
        }

        const name = String(fullName || '').trim();
        if (name.length < 2) {
            const err = new Error('Full name is required');
            err.code = 'invalid_name';
            throw err;
        }
        const pwd = String(password || '');
        if (pwd.length < 8) {
            const err = new Error('Password must be at least 8 characters');
            err.code = 'invalid_password';
            throw err;
        }

        const cohortLabel = String(cohortName || '').trim();
        if (invite.role === 'owner') {
            if (cohortLabel.length < 2) {
                const err = new Error('Create your first cohort to continue');
                err.code = 'invalid_cohort';
                throw err;
            }
        }

        let user = await usersRepo.findByEmail(email);
        if (user) {
            const existingMem = await orgMembershipsRepo.findMembership(invite.orgId, user.user_id);
            if (existingMem && existingMem.status === 'active') {
                const err = new Error('An account already exists for this email — sign in instead');
                err.code = 'account_exists';
                throw err;
            }
            const accountType = String(user.account_type || '').toLowerCase();
            if (accountType === 'student') {
                const err = new Error('Student accounts cannot accept club staff invites');
                err.code = 'role_conflict_student';
                throw err;
            }
            // Recover from a previous failed complete that created the user but not the membership.
        } else {
            const passwordHash = await hashPassword(pwd);
            const accountType = invite.role === 'tutor' ? 'tutor' : 'organization';
            user = await writeLocalUser({
                email,
                passwordHash,
                fullName: name,
                accountType,
            });
        }

        const membership = await orgMembershipsRepo.activateInvite(invite.id, user.user_id, {
            keepInviteToken: true,
            seatCounts: seatCountsForRole(invite.role),
        });

        let activeMembership = membership;
        if (!activeMembership) {
            // Fallback if activate couldn't match (e.g. odd status): clear token on pending then upsert.
            await orgMembershipsRepo.removeMember(invite.orgId, invite.userId);
            activeMembership = await orgMembershipsRepo.upsertMember({
                orgId: invite.orgId,
                userId: user.user_id,
                role: invite.role,
                status: 'active',
                invitedBy: invite.invitedBy,
                inviteEmail: email,
                inviteToken: invite.inviteToken,
                seatCounts: seatCountsForRole(invite.role),
            });
        }

        let cohort = null;
        if (invite.role === 'owner' && cohortLabel.length >= 2) {
            cohort = await cohortsService.createCohort({
                orgId: invite.orgId,
                name: cohortLabel,
                createdBy: user.user_id,
            });
        }
        const org = await withSeatUsage(await orgsRepo.findById(invite.orgId));
        const authToken = issueToken({
            user_id: user.user_id,
            account_type: user.account_type || (invite.role === 'tutor' ? 'tutor' : 'organization'),
        });

        return {
            token: authToken,
            user: {
                user_id: user.user_id,
                email: user.email || email,
                full_name: user.full_name || name,
                role: user.account_type || (invite.role === 'tutor' ? 'tutor' : 'organization'),
                handle: null,
                isPublicProfile: false,
                accentColor: null,
                avatarId: null,
                onboardingCompletedAt: null,
                onboardingSkippedAt: null,
            },
            membership: activeMembership,
            org,
            cohort,
        };
    }

    return {
        createOrg,
        listOrgsWithSeats,
        getOrgWithSeats,
        updateOrg,
        addMember,
        listOrgMembers,
        listMyOrgs,
        previewInvite,
        acceptInvite,
        completeInvite,
        cancelInvite,
        assertStudentSignupAllowed,
        withSeatUsage,
    };
}

const defaults = createOrgsService();

module.exports = {
    createOrgsService,
    makeInviteToken,
    createOrg: defaults.createOrg,
    listOrgsWithSeats: defaults.listOrgsWithSeats,
    getOrgWithSeats: defaults.getOrgWithSeats,
    updateOrg: defaults.updateOrg,
    addMember: defaults.addMember,
    listOrgMembers: defaults.listOrgMembers,
    listMyOrgs: defaults.listMyOrgs,
    previewInvite: defaults.previewInvite,
    acceptInvite: defaults.acceptInvite,
    completeInvite: defaults.completeInvite,
    cancelInvite: defaults.cancelInvite,
    assertStudentSignupAllowed: defaults.assertStudentSignupAllowed,
    withSeatUsage: defaults.withSeatUsage,
};
