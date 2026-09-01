const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { ObjectId } = require('mongodb');
const {
    slugifyOrgName,
    normalizeOrgSlug,
    seatCountsForRole,
} = require('../helpers/orgSlug');
const { createOrgsService } = require('../helpers/orgs');
const {
    createOrgBodySchema,
    addOrgMemberBodySchema,
    acceptOrgInviteBodySchema,
} = require('../contracts/platform');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

function memoryOrgs() {
    const orgs = new Map();
    const memberships = [];
    let inviteSeq = 0;

    return {
        orgsRepo: {
            async create({ name, slug, seatCap, status }) {
                const id = new ObjectId().toString();
                const org = {
                    id,
                    name,
                    slug,
                    status: status || 'active',
                    seatCap: seatCap ?? 40,
                    settings: { allowPublicOptIn: true, vanityEnabled: false },
                    billing: { plan: null, externalCustomerId: null },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                orgs.set(id, org);
                return org;
            },
            async findById(id) {
                return orgs.get(String(id)) || null;
            },
            async list() {
                return [...orgs.values()];
            },
            async update(id, patch) {
                const org = orgs.get(String(id));
                if (!org) return null;
                if (patch.name !== undefined) org.name = patch.name;
                if (patch.seatCap !== undefined) org.seatCap = patch.seatCap;
                if (patch.status !== undefined) org.status = patch.status;
                org.updatedAt = new Date();
                return org;
            },
        },
        orgMembershipsRepo: {
            async upsertMember(input) {
                const existing = memberships.find(
                    (row) => row.orgId === String(input.orgId) && row.userId === String(input.userId)
                );
                const row = {
                    id: existing?.id || new ObjectId().toString(),
                    orgId: String(input.orgId),
                    userId: String(input.userId),
                    role: input.role,
                    status: input.status,
                    seatCounts: input.seatCounts === true,
                    invitedBy: input.invitedBy || null,
                    inviteEmail: input.inviteEmail || null,
                    inviteToken: input.inviteToken || null,
                    joinedAt: input.status === 'active' ? new Date() : null,
                    createdAt: existing?.createdAt || new Date(),
                };
                if (existing) {
                    Object.assign(existing, row);
                    return existing;
                }
                memberships.push(row);
                return row;
            },
            async findMembership(orgId, userId) {
                return memberships.find(
                    (row) => row.orgId === String(orgId) && row.userId === String(userId)
                ) || null;
            },
            async listByOrg(orgId) {
                return memberships.filter((row) => row.orgId === String(orgId));
            },
            async listByUser(userId, { status } = {}) {
                return memberships.filter(
                    (row) => row.userId === String(userId) && (!status || row.status === status)
                );
            },
            async countSeats(orgId) {
                return memberships.filter(
                    (row) => row.orgId === String(orgId) && row.status === 'active' && row.seatCounts
                ).length;
            },
            async findByInviteToken(token) {
                return memberships.find((row) => row.inviteToken === token) || null;
            },
            async activateInvite(membershipId, userId, { keepInviteToken = true, seatCounts } = {}) {
                const row = memberships.find((m) => m.id === membershipId);
                if (!row || (row.status !== 'invited' && row.status !== 'removed')) return null;
                row.userId = String(userId);
                row.status = 'active';
                row.joinedAt = new Date();
                if (seatCounts !== undefined) row.seatCounts = Boolean(seatCounts);
                if (!keepInviteToken) row.inviteToken = null;
                return row;
            },
            async setInviteToken(membershipId, inviteToken) {
                const row = memberships.find((m) => m.id === membershipId);
                if (!row) return null;
                row.inviteToken = inviteToken;
                return row;
            },
            async findPendingStaffInviteByEmail(email) {
                const value = String(email || '').toLowerCase();
                return memberships.find(
                    (row) =>
                        String(row.inviteEmail || '').toLowerCase() === value &&
                        row.status === 'invited' &&
                        (row.role === 'owner' || row.role === 'tutor')
                ) || null;
            },
            async cancelInvite(membershipId) {
                const row = memberships.find((m) => m.id === membershipId);
                if (!row || row.status !== 'invited') return null;
                row.status = 'removed';
                row.seatCounts = false;
                row.inviteToken = null;
                return row;
            },
            async removeMember(orgId, userId) {
                const row = memberships.find(
                    (m) => m.orgId === String(orgId) && m.userId === String(userId)
                );
                if (!row) return null;
                row.status = 'removed';
                row.seatCounts = false;
                row.inviteToken = null;
                return row;
            },
        },
        usersRepo: {
            users: [
                { user_id: 'ownr01', email: 'owner@club.test', full_name: 'Owner', account_type: 'tutor' },
                { user_id: 'stud01', email: 'kid@club.test', full_name: 'Kid', account_type: 'student' },
                { user_id: 'tutr01', email: 'tutor@club.test', full_name: 'Tutor', account_type: 'tutor' },
            ],
            async findByUserId(userId) {
                return this.users.find((user) => user.user_id === userId) || null;
            },
            async findByEmail(email) {
                const value = String(email || '').toLowerCase();
                return this.users.find((user) => String(user.email).toLowerCase() === value) || null;
            },
        },
        memberships,
        nextInvite() {
            inviteSeq += 1;
            return `token-${inviteSeq}`;
        },
    };
}

describe('org slug helpers', () => {
    it('slugifies names and rejects reserved hosts', () => {
        assert.equal(slugifyOrgName('Riverside After-School'), 'riverside-after-school');
        assert.equal(normalizeOrgSlug('riverside'), 'riverside');
        assert.equal(normalizeOrgSlug('APP'), null);
        assert.equal(normalizeOrgSlug('Bad Slug'), null);
        assert.equal(seatCountsForRole('student'), true);
        assert.equal(seatCountsForRole('owner'), false);
    });
});

describe('org membership service', () => {
    it('creates an org, assigns an existing owner, and counts student seats', async () => {
        const deps = memoryOrgs();
        const service = createOrgsService(deps);
        const created = await service.createOrg({
            name: 'Riverside After-School',
            seatCap: 2,
            ownerUserId: 'ownr01',
        });
        assert.equal(created.org.slug, 'riverside-after-school');
        assert.equal(created.owner.role, 'owner');
        assert.equal(created.org.seatsUsed, 0);

        await service.addMember({
            orgId: created.org.id,
            userId: 'stud01',
            role: 'student',
        });
        const org = await service.getOrgWithSeats(created.org.id);
        assert.equal(org.seatsUsed, 1);
        assert.equal(org.seatsRemaining, 1);

        await service.addMember({
            orgId: created.org.id,
            userId: 'tutr01',
            role: 'tutor',
        });
        const afterTutor = await service.getOrgWithSeats(created.org.id);
        assert.equal(afterTutor.seatsUsed, 1);

        deps.usersRepo.users.push({ user_id: 'stud02', email: 'kid2@club.test' });
        await service.addMember({ orgId: created.org.id, userId: 'stud02', role: 'student' });
        const full = await service.getOrgWithSeats(created.org.id);
        assert.equal(full.seatsUsed, 2);

        await assert.rejects(
            () => service.addMember({ orgId: created.org.id, email: 'kid3@club.test', role: 'student' }),
            (err) => err.code === 'seat_cap'
        );
    });

    it('creates an email invite and accepts it onto the real user account', async () => {
        const deps = memoryOrgs();
        const service = createOrgsService(deps);
        const created = await service.createOrg({
            name: 'Byte Club',
            slug: 'byte-club',
            ownerEmail: 'new-owner@club.test',
        });
        assert.equal(created.owner.status, 'invited');
        assert.ok(created.owner.inviteToken);

        deps.usersRepo.users.push({
            user_id: 'ownr99',
            email: 'new-owner@club.test',
        });
        const membership = await service.acceptInvite({
            token: created.owner.inviteToken,
            userId: 'ownr99',
            email: 'new-owner@club.test',
        });
        assert.equal(membership.status, 'active');
        assert.equal(membership.userId, 'ownr99');
        assert.equal(membership.role, 'owner');
        assert.equal(membership.inviteToken, created.owner.inviteToken);

        const mine = await service.listMyOrgs('ownr99');
        assert.equal(mine.length, 1);
        assert.equal(mine[0].org.slug, 'byte-club');

        const preview = await service.previewInvite(created.owner.inviteToken);
        assert.equal(preview.needsOnboarding, false);
        assert.equal(preview.org.slug, 'byte-club');
    });

    it('onboards an owner from invite: password + first cohort', async () => {
        const deps = memoryOrgs();
        const cohorts = [];
        const service = createOrgsService({
            ...deps,
            hashPassword: async (password) => `hash:${password}`,
            insertLocalUser: async ({ email, passwordHash, fullName, accountType }) => {
                const user = {
                    user_id: 'org001',
                    email,
                    password_hash: passwordHash,
                    account_type: accountType,
                    full_name: fullName,
                };
                deps.usersRepo.users.push(user);
                return user;
            },
            issueToken: () => 'jwt-org-token',
            cohortsService: {
                async createCohort({ orgId, name, createdBy }) {
                    const cohort = {
                        id: 'coh1',
                        orgId,
                        name,
                        joinCode: 'BYTE-THU',
                        createdBy,
                        memberCount: 0,
                    };
                    cohorts.push(cohort);
                    return cohort;
                },
            },
        });

        const created = await service.createOrg({
            name: 'Byte Club',
            slug: 'byte',
            ownerEmail: 'fresh@club.test',
        });

        const result = await service.completeInvite({
            token: created.owner.inviteToken,
            fullName: 'Fresh Owner',
            password: 'password123',
            cohortName: 'Thu KS2',
        });

        assert.equal(result.token, 'jwt-org-token');
        assert.equal(result.user.role, 'organization');
        assert.equal(result.membership.status, 'active');
        assert.equal(result.membership.inviteToken, created.owner.inviteToken);
        assert.equal(result.cohort.name, 'Thu KS2');
        assert.equal(cohorts.length, 1);

        await assert.rejects(
            () =>
                service.completeInvite({
                    token: created.owner.inviteToken,
                    fullName: 'Again',
                    password: 'password123',
                    cohortName: 'Sat',
                }),
            (err) => err.code === 'invite_already_completed'
        );
    });

    it('rejects adding a student account as club tutor', async () => {
        const deps = memoryOrgs();
        const service = createOrgsService(deps);
        const created = await service.createOrg({
            name: 'Gate Club',
            ownerUserId: 'ownr01',
        });
        await assert.rejects(
            () =>
                service.addMember({
                    orgId: created.org.id,
                    userId: 'stud01',
                    role: 'tutor',
                }),
            (err) => err.code === 'role_conflict_student'
        );
    });

    it('blocks student signup while a staff invite is pending, then allows after cancel', async () => {
        const deps = memoryOrgs();
        const service = createOrgsService(deps);
        const created = await service.createOrg({
            name: 'Invite Gate',
            ownerEmail: 'pending-tutor@club.test',
        });
        assert.ok(created.owner.inviteToken);

        await assert.rejects(
            () => service.assertStudentSignupAllowed('pending-tutor@club.test'),
            (err) => err.code === 'staff_invite_pending'
        );

        const cancelled = await service.cancelInvite({
            orgId: created.org.id,
            membershipId: created.owner.id,
            asSuperadmin: true,
        });
        assert.equal(cancelled.status, 'removed');
        assert.equal(cancelled.inviteToken, null);

        await service.assertStudentSignupAllowed('pending-tutor@club.test');
    });
});

describe('org API wiring', () => {
    it('mounts superadmin and authenticated org routes', () => {
        const routes = read('routes/superadminRoutes.js');
        assert.match(routes, /\/orgs/);
        assert.match(routes, /orgsController\.createOrg/);
        const userRoutes = read('routes/orgsRoutes.js');
        assert.match(userRoutes, /\/mine/);
        assert.match(userRoutes, /\/invites\/accept/);
        assert.match(userRoutes, /\/invites\/:token\/complete/);
        assert.match(userRoutes, /\/:id\/programs/);
        assert.match(userRoutes, /listOrgPrograms/);
        assert.match(userRoutes, /previewInvite/);
        assert.match(userRoutes, /completeInvite/);
        const server = read('server.js');
        assert.match(server, /\/api\/orgs/);
        assert.match(read('controllers/orgsController.js'), /createOrg/);
        assert.equal(read('controllers/orgsController.js').includes('getMainDb'), false);
        assert.match(read('repositories/orgsRepo.js'), /orgs/);
        assert.match(read('repositories/orgMembershipsRepo.js'), /org_memberships/);
    });

    it('validates create and invite payloads', () => {
        assert.equal(
            createOrgBodySchema.safeParse({ name: 'Riverside', ownerEmail: 'a@b.com' }).success,
            true
        );
        assert.equal(createOrgBodySchema.safeParse({ name: 'Riverside' }).success, false);
        assert.equal(createOrgBodySchema.safeParse({ name: 'A', ownerEmail: 'a@b.com' }).success, false);
        assert.equal(addOrgMemberBodySchema.safeParse({ email: 'a@b.com', role: 'tutor' }).success, true);
        assert.equal(addOrgMemberBodySchema.safeParse({ role: 'tutor' }).success, false);
        assert.equal(acceptOrgInviteBodySchema.safeParse({ token: 'abcdefghijklmnop' }).success, true);
        const { completeOrgInviteBodySchema } = require('../contracts/platform');
        assert.equal(
            completeOrgInviteBodySchema.safeParse({
                fullName: 'Ada',
                password: 'password1',
            }).success,
            true
        );
        assert.equal(
            completeOrgInviteBodySchema.safeParse({
                fullName: 'Ada',
                password: 'short',
                cohortName: 'Thu',
            }).success,
            false
        );
    });
});
