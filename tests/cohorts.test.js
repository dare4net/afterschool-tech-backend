const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { ObjectId } = require('mongodb');
const { normalizeJoinCode, suggestJoinCode } = require('../helpers/joinCode');
const { createCohortsService } = require('../helpers/cohorts');
const {
    createCohortBodySchema,
    joinCohortBodySchema,
} = require('../contracts/platform');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

function memoryCohorts() {
    const orgs = new Map();
    const cohorts = new Map();
    const orgMemberships = [];
    const cohortMemberships = [];
    const registrations = [];

    const orgId = new ObjectId().toString();
    orgs.set(orgId, {
        id: orgId,
        name: 'Riverside',
        slug: 'riverside',
        status: 'active',
        seatCap: 2,
        settings: { allowPublicOptIn: true },
    });

    const publicAccessByUser = new Map();

    return {
        orgId,
        publicAccessByUser,
        orgsRepo: {
            async findById(id) {
                return orgs.get(String(id)) || null;
            },
        },
        orgMembershipsRepo: {
            async findMembership(oId, userId) {
                return orgMemberships.find(
                    (row) => row.orgId === String(oId) && row.userId === String(userId) && row.status === 'active'
                ) || null;
            },
            async countSeats(oId) {
                return orgMemberships.filter(
                    (row) => row.orgId === String(oId) && row.status === 'active' && row.seatCounts
                ).length;
            },
            async upsertMember(input) {
                const existing = orgMemberships.find(
                    (row) => row.orgId === String(input.orgId) && row.userId === String(input.userId)
                );
                const row = {
                    id: existing?.id || new ObjectId().toString(),
                    orgId: String(input.orgId),
                    userId: String(input.userId),
                    role: input.role,
                    status: input.status,
                    seatCounts: input.seatCounts === true,
                };
                if (existing) Object.assign(existing, row);
                else orgMemberships.push(row);
                return existing || row;
            },
        },
        cohortsRepo: {
            async create(input) {
                const id = new ObjectId().toString();
                const cohort = {
                    id,
                    orgId: String(input.orgId),
                    name: input.name,
                    joinCode: input.joinCode,
                    status: 'active',
                    programIds: (input.programIds || []).map(String),
                    createdBy: input.createdBy || null,
                };
                if ([...cohorts.values()].some((row) => row.joinCode === cohort.joinCode)) {
                    const err = new Error('Join code already in use');
                    err.code = 'join_code_taken';
                    throw err;
                }
                cohorts.set(id, cohort);
                return cohort;
            },
            async findById(id) {
                return cohorts.get(String(id)) || null;
            },
            async findByJoinCode(code) {
                const normalized = normalizeJoinCode(code);
                return [...cohorts.values()].find(
                    (row) => row.joinCode === normalized && row.status === 'active'
                ) || null;
            },
            async listByOrg(oId) {
                return [...cohorts.values()].filter((row) => row.orgId === String(oId));
            },
            async update(id, patch) {
                const cohort = cohorts.get(String(id));
                if (!cohort) return null;
                if (patch.name !== undefined) cohort.name = patch.name;
                if (patch.programIds !== undefined) cohort.programIds = patch.programIds.map(String);
                if (patch.status !== undefined) cohort.status = patch.status;
                return cohort;
            },
        },
        cohortMembershipsRepo: {
            async upsert(input) {
                const existing = cohortMemberships.find(
                    (row) => row.cohortId === String(input.cohortId) && row.userId === String(input.userId)
                );
                const row = {
                    id: existing?.id || new ObjectId().toString(),
                    cohortId: String(input.cohortId),
                    orgId: String(input.orgId),
                    userId: String(input.userId),
                    status: input.status,
                };
                if (existing) Object.assign(existing, row);
                else cohortMemberships.push(row);
                return existing || row;
            },
            async find(cohortId, userId) {
                return cohortMemberships.find(
                    (row) => row.cohortId === String(cohortId) && row.userId === String(userId)
                ) || null;
            },
            async listByCohort(cohortId, { status = 'active' } = {}) {
                return cohortMemberships.filter(
                    (row) => row.cohortId === String(cohortId) && row.status === status
                );
            },
            async countByCohort(cohortId) {
                return cohortMemberships.filter(
                    (row) => row.cohortId === String(cohortId) && row.status === 'active'
                ).length;
            },
            async listActiveForOrgUser(oId, userId) {
                return cohortMemberships.filter(
                    (row) =>
                        row.orgId === String(oId) &&
                        row.userId === String(userId) &&
                        row.status === 'active',
                );
            },
        },
        curriculumRepo: {
            async ensureRegistration(input) {
                const existing = registrations.find(
                    (row) => row.userId === input.userId && row.programId === String(input.programId)
                );
                if (existing) return { created: false, registration: existing };
                const registration = {
                    userId: input.userId,
                    programId: String(input.programId),
                    orgId: input.orgId,
                    cohortId: input.cohortId,
                    source: input.source,
                };
                registrations.push(registration);
                return { created: true, registration };
            },
        },
        usersRepo: {
            async updateIdentity(userId, patch) {
                if (patch.public_access !== undefined) {
                    publicAccessByUser.set(String(userId), patch.public_access === true);
                }
            },
        },
        registrations,
        orgMemberships,
    };
}

describe('join codes', () => {
    it('normalizes and suggests codes', () => {
        assert.equal(normalizeJoinCode('riv-thu'), 'RIV-THU');
        assert.equal(normalizeJoinCode('ab'), null);
        assert.equal(normalizeJoinCode(''), null);
        assert.match(suggestJoinCode('riverside', 'Thu KS2'), /^[A-Z0-9-]+$/);
    });
});

describe('cohort join service', () => {
    it('creates a cohort and joins a student with program enrolments', async () => {
        const deps = memoryCohorts();
        const service = createCohortsService(deps);
        const programId = new ObjectId().toString();
        const cohort = await service.createCohort({
            orgId: deps.orgId,
            name: 'Thu KS2',
            joinCode: 'RIV-THU',
            programIds: [programId],
            createdBy: 'ownr01',
        });
        assert.equal(cohort.joinCode, 'RIV-THU');
        assert.equal(cohort.memberCount, 0);

        const joined = await service.joinByCode({ code: 'riv-thu', userId: 'stud01' });
        assert.equal(joined.cohortMembership.userId, 'stud01');
        assert.equal(joined.orgMembership.role, 'student');
        assert.equal(joined.alreadyInCohort, false);
        assert.equal(joined.enrolled.length, 1);
        assert.equal(joined.enrolled[0].created, true);
        assert.equal(deps.registrations[0].source, 'cohort');

        const again = await service.joinByCode({ code: 'RIV-THU', userId: 'stud01' });
        assert.equal(again.alreadyInCohort, true);
        assert.equal(again.enrolled[0].created, false);

        await service.joinByCode({ code: 'RIV-THU', userId: 'stud02' });
        await assert.rejects(
            () => service.joinByCode({ code: 'RIV-THU', userId: 'stud03' }),
            (err) => err.code === 'seat_cap'
        );
    });

    it('enrols existing cohort members when new programs are assigned', async () => {
        const deps = memoryCohorts();
        const service = createCohortsService(deps);
        const programA = new ObjectId().toString();
        const programB = new ObjectId().toString();
        const cohort = await service.createCohort({
            orgId: deps.orgId,
            name: 'Thu KS2',
            joinCode: 'RIV-THU',
            programIds: [programA],
            createdBy: 'ownr01',
        });
        await service.joinByCode({ code: 'RIV-THU', userId: 'stud01' });
        assert.equal(deps.registrations.length, 1);

        const updated = await service.updateCohort(cohort.id, { programIds: [programA, programB] });
        assert.deepEqual(updated.programIds, [programA, programB]);
        assert.equal(deps.registrations.length, 2);
        assert.equal(deps.registrations[1].programId, programB);
        assert.equal(deps.registrations[1].userId, 'stud01');
        assert.equal(deps.registrations[1].source, 'cohort');
    });

    it('revokes public_access when joining a club that blocks public catalog opt-in', async () => {
        const deps = memoryCohorts();
        const orgsMap = new Map();
        orgsMap.set(deps.orgId, {
            id: deps.orgId,
            name: 'Riverside',
            slug: 'riverside',
            status: 'active',
            seatCap: 2,
            settings: { allowPublicOptIn: false },
        });
        deps.orgsRepo.findById = async (id) => orgsMap.get(String(id)) || null;

        deps.publicAccessByUser.set('stud01', true);
        const service = createCohortsService(deps);
        await service.createCohort({
            orgId: deps.orgId,
            name: 'Thu KS2',
            joinCode: 'RIV-THU',
            programIds: [],
            createdBy: 'ownr01',
        });

        await service.joinByCode({ code: 'RIV-THU', userId: 'stud01' });
        assert.equal(deps.publicAccessByUser.get('stud01'), false);
    });
});

describe('cohort API wiring', () => {
    it('mounts cohort routes on superadmin and orgs routers', () => {
        assert.match(read('routes/superadminRoutes.js'), /\/orgs\/:id\/cohorts/);
        assert.match(read('routes/superadminRoutes.js'), /\/orgs\/:id\/programs/);
        assert.match(read('routes/orgsRoutes.js'), /\/join\/preview/);
        assert.match(read('routes/orgsRoutes.js'), /\/public\/:slug/);
        assert.match(read('routes/orgsRoutes.js'), /joinCohort/);
        assert.match(read('repositories/cohortsRepo.js'), /cohorts/);
        assert.match(read('repositories/cohortMembershipsRepo.js'), /cohort_memberships/);
        assert.match(read('repositories/curriculumRepo.js'), /ensureRegistration/);
        assert.equal(createCohortBodySchema.safeParse({ name: 'Thu KS2' }).success, true);
        assert.equal(joinCohortBodySchema.safeParse({ code: 'RIV' }).success, true);
    });
});
