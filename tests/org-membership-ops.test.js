const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { ObjectId } = require('mongodb');
const { createCohortsService } = require('../helpers/cohorts');
const { createOrgsService } = require('../helpers/orgs');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

function memoryMembershipOps() {
    const orgId = new ObjectId().toString();
    const cohortA = new ObjectId().toString();
    const cohortB = new ObjectId().toString();
    const orgMemberships = [];
    const cohortMemberships = [];
    const registrations = [];

    const orgsRepo = {
        async findById(id) {
            if (String(id) !== orgId) return null;
            return { id: orgId, name: 'Riverside', slug: 'riverside', status: 'active', seatCap: 10, settings: {} };
        },
    };

    const orgMembershipsRepo = {
        async findMembership(oId, userId) {
            return orgMemberships.find(
                (row) => row.orgId === String(oId) && row.userId === String(userId) && row.status === 'active',
            ) || null;
        },
        async removeMember(oId, userId) {
            const row = orgMemberships.find(
                (row) => row.orgId === String(oId) && row.userId === String(userId),
            );
            if (!row) return null;
            row.status = 'removed';
            row.seatCounts = false;
            return row;
        },
    };

    const cohortsRepo = {
        async findById(id) {
            if (String(id) === cohortA) {
                return { id: cohortA, orgId, name: 'Thu KS2', joinCode: 'THU-KS2', status: 'active', programIds: ['p1'] };
            }
            if (String(id) === cohortB) {
                return { id: cohortB, orgId, name: 'Fri KS3', joinCode: 'FRI-KS3', status: 'active', programIds: ['p2'] };
            }
            return null;
        },
        async findByJoinCode(code) {
            if (code === 'THU-KS2') return this.findById(cohortA);
            if (code === 'FRI-KS3') return this.findById(cohortB);
            return null;
        },
    };

    const cohortMembershipsRepo = {
        rows: cohortMemberships,
        async find(cohortId, userId) {
            return cohortMemberships.find(
                (row) => row.cohortId === String(cohortId) && row.userId === String(userId),
            ) || null;
        },
        async listActiveForOrgUser(oId, userId) {
            return cohortMemberships.filter(
                (row) => row.orgId === String(oId) && row.userId === String(userId) && row.status === 'active',
            );
        },
        async deactivateForOrgUser(oId, userId, { exceptCohortId } = {}) {
            let count = 0;
            for (const row of cohortMemberships) {
                if (
                    row.orgId === String(oId) &&
                    row.userId === String(userId) &&
                    row.status === 'active' &&
                    (!exceptCohortId || row.cohortId !== String(exceptCohortId))
                ) {
                    row.status = 'removed';
                    count += 1;
                }
            }
            return count;
        },
        async upsert({ cohortId, orgId, userId, status = 'active' }) {
            const existing = cohortMemberships.find(
                (row) => row.cohortId === String(cohortId) && row.userId === String(userId),
            );
            const row = {
                id: existing?.id || new ObjectId().toString(),
                cohortId: String(cohortId),
                orgId: String(orgId),
                userId: String(userId),
                status,
            };
            if (existing) Object.assign(existing, row);
            else cohortMemberships.push(row);
            return row;
        },
        async listByCohort() {
            return [];
        },
        async countByCohort() {
            return 0;
        },
    };

    const curriculumRepo = {
        async ensureRegistration(input) {
            registrations.push(input);
            return { created: true, registration: input };
        },
    };

    orgMemberships.push({
        id: 'm1',
        orgId,
        userId: 'stud01',
        role: 'student',
        status: 'active',
        seatCounts: true,
    });

    cohortMemberships.push({
        id: 'cm1',
        cohortId: cohortA,
        orgId,
        userId: 'stud01',
        status: 'active',
    });

    const cohortsService = createCohortsService({
        orgsRepo,
        orgMembershipsRepo,
        cohortsRepo,
        cohortMembershipsRepo,
        curriculumRepo,
        usersRepo: { async updateIdentity() {} },
    });

    return {
        orgId,
        cohortA,
        cohortB,
        orgMemberships,
        cohortMemberships,
        registrations,
        orgMembershipsRepo,
        cohortMembershipsRepo,
        cohorts: cohortsService,
        orgs: createOrgsService({
            orgsRepo,
            orgMembershipsRepo,
            cohortMembershipsRepo,
            cohortsService,
        }),
    };
}

describe('org membership ops', () => {
    it('wires remove, assign, and leave routes', () => {
        assert.match(read('routes/orgsRoutes.js'), /removeStudentMember/);
        assert.match(read('routes/orgsRoutes.js'), /assignMemberToCohort/);
        assert.match(read('routes/orgsRoutes.js'), /leaveOrg/);
        assert.match(read('helpers/orgMemberRoster.js'), /enrichMembersWithCohorts/);
    });

    it('blocks join when student already has another cohort in the same org', async () => {
        const deps = memoryMembershipOps();
        await assert.rejects(
            () => deps.cohorts.joinByCode({ code: 'FRI-KS3', userId: 'stud01' }),
            (err) => err.code === 'already_in_cohort',
        );
    });

    it('moves a student to another cohort and enrolls programs', async () => {
        const deps = memoryMembershipOps();
        const result = await deps.cohorts.assignStudentToCohort({
            orgId: deps.orgId,
            cohortId: deps.cohortB,
            userId: 'stud01',
        });
        assert.equal(result.cohort.id, deps.cohortB);
        assert.equal(
            deps.cohortMemberships.filter((row) => row.status === 'active' && row.userId === 'stud01').length,
            1,
        );
        assert.equal(deps.registrations.some((row) => row.programId === 'p2'), true);
    });

    it('lets a student leave their club and frees the seat', async () => {
        const deps = memoryMembershipOps();
        const removed = await deps.orgs.leaveOrgAsStudent({
            orgId: deps.orgId,
            userId: 'stud01',
        });
        assert.equal(removed.status, 'removed');
        assert.equal(removed.seatCounts, false);
        assert.equal(
            deps.cohortMemberships.filter((row) => row.userId === 'stud01' && row.status === 'active').length,
            0,
        );
        await assert.rejects(
            () => deps.orgs.leaveOrgAsStudent({ orgId: deps.orgId, userId: 'stud01' }),
            (err) => err.code === 'invalid_member',
        );
    });

    it('blocks non-students from self-serve leave', async () => {
        const deps = memoryMembershipOps();
        deps.orgMemberships.push({
            id: 'm2',
            orgId: deps.orgId,
            userId: 'tutor01',
            role: 'tutor',
            status: 'active',
            seatCounts: false,
        });
        await assert.rejects(
            () => deps.orgs.leaveOrgAsStudent({ orgId: deps.orgId, userId: 'tutor01' }),
            (err) => err.code === 'invalid_role',
        );
    });
});
