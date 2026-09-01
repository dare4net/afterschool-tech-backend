const defaultOrgsRepo = require('../repositories/orgsRepo');
const defaultOrgMembershipsRepo = require('../repositories/orgMembershipsRepo');
const defaultCohortsRepo = require('../repositories/cohortsRepo');
const defaultCohortMembershipsRepo = require('../repositories/cohortMembershipsRepo');
const defaultCurriculumRepo = require('../repositories/curriculumRepo');
const defaultUsersRepo = require('../repositories/usersRepo');
const { resolveOrgAccent } = require('./orgBranding');
const { seatCountsForRole } = require('./orgSlug');
const { normalizeJoinCode, suggestJoinCode } = require('./joinCode');

function createCohortsService({
    orgsRepo = defaultOrgsRepo,
    orgMembershipsRepo = defaultOrgMembershipsRepo,
    cohortsRepo = defaultCohortsRepo,
    cohortMembershipsRepo = defaultCohortMembershipsRepo,
    curriculumRepo = defaultCurriculumRepo,
    usersRepo = defaultUsersRepo,
} = {}) {
    async function withCounts(cohort) {
        if (!cohort) return null;
        const memberCount = await cohortMembershipsRepo.countByCohort(cohort.id);
        return { ...cohort, memberCount };
    }

    async function createCohort({
        orgId,
        name,
        joinCode,
        programIds = [],
        createdBy = null,
    } = {}) {
        const org = await orgsRepo.findById(orgId);
        if (!org) {
            const err = new Error('Org not found');
            err.code = 'org_not_found';
            throw err;
        }
        if (org.status === 'suspended') {
            const err = new Error('Org is suspended');
            err.code = 'org_suspended';
            throw err;
        }
        const code = normalizeJoinCode(joinCode) || suggestJoinCode(org.slug, name);
        const cohort = await cohortsRepo.create({
            orgId: org.id,
            name,
            joinCode: code,
            programIds,
            createdBy,
        });
        return withCounts(cohort);
    }

    async function listCohorts(orgId) {
        const rows = await cohortsRepo.listByOrg(orgId);
        return Promise.all(rows.map(withCounts));
    }

    async function getCohort(cohortId) {
        return withCounts(await cohortsRepo.findById(cohortId));
    }

    async function updateCohort(cohortId, patch) {
        const before = await cohortsRepo.findById(cohortId);
        const beforeIds = new Set((before?.programIds || []).map(String));
        const cohort = await cohortsRepo.update(cohortId, patch);
        if (!cohort) return null;

        if (patch.programIds !== undefined && before) {
            const added = (cohort.programIds || []).filter((id) => !beforeIds.has(String(id)));
            if (added.length > 0) {
                await enrollCohortMembersInPrograms(cohort, added);
            }
        }

        return withCounts(cohort);
    }

    async function enrollCohortMembersInPrograms(cohort, programIds) {
        const members = await cohortMembershipsRepo.listByCohort(cohort.id, { status: 'active' });
        for (const member of members) {
            for (const programId of programIds) {
                await curriculumRepo.ensureRegistration({
                    userId: member.userId,
                    programId,
                    orgId: cohort.orgId,
                    cohortId: cohort.id,
                    source: 'cohort',
                });
            }
        }
    }

    async function enrollStudentInCohortPrograms({ cohort, orgId, userId }) {
        const enrolled = [];
        for (const programId of cohort.programIds || []) {
            const result = await curriculumRepo.ensureRegistration({
                userId,
                programId,
                orgId,
                cohortId: cohort.id,
                source: 'cohort',
            });
            if (result.created || result.registration) {
                enrolled.push({
                    programId: String(programId),
                    created: Boolean(result.created),
                });
            }
        }
        return enrolled;
    }

    async function assertNoOtherCohortInOrg({ orgId, userId, cohortId }) {
        const active = await cohortMembershipsRepo.listActiveForOrgUser(orgId, userId);
        const conflict = active.find((row) => String(row.cohortId) !== String(cohortId));
        if (conflict) {
            const err = new Error(
                'This student is already in another class for this club. Ask your club leader to move them.',
            );
            err.code = 'already_in_cohort';
            throw err;
        }
    }

    async function assignStudentToCohort({ orgId, cohortId, userId } = {}) {
        const uid = String(userId || '').trim();
        const oid = String(orgId || '').trim();
        const cid = String(cohortId || '').trim();
        if (!uid || !oid || !cid) {
            const err = new Error('orgId, cohortId, and userId are required');
            err.code = 'invalid_member';
            throw err;
        }

        const cohort = await cohortsRepo.findById(cid);
        if (!cohort || String(cohort.orgId) !== oid) {
            const err = new Error('Cohort not found');
            err.code = 'join_code_not_found';
            throw err;
        }

        const membership = await orgMembershipsRepo.findMembership(oid, uid);
        if (!membership || membership.status !== 'active' || membership.role !== 'student') {
            const err = new Error('Active student membership required');
            err.code = 'invalid_member';
            throw err;
        }

        await cohortMembershipsRepo.deactivateForOrgUser(oid, uid, { exceptCohortId: cid });
        const cohortMembership = await cohortMembershipsRepo.upsert({
            cohortId: cid,
            orgId: oid,
            userId: uid,
            status: 'active',
        });
        const enrolled = await enrollStudentInCohortPrograms({
            cohort,
            orgId: oid,
            userId: uid,
        });

        return {
            cohort: await withCounts(cohort),
            cohortMembership,
            enrolled,
        };
    }

    async function previewJoinCode(code) {
        const cohort = await cohortsRepo.findByJoinCode(code);
        if (!cohort) {
            const err = new Error('Join code not found');
            err.code = 'join_code_not_found';
            throw err;
        }
        const org = await orgsRepo.findById(cohort.orgId);
        if (!org || org.status === 'suspended') {
            const err = new Error('Organisation is not available');
            err.code = 'org_unavailable';
            throw err;
        }
        return {
            cohort: await withCounts(cohort),
            org: {
                id: org.id,
                name: org.name,
                slug: org.slug,
                status: org.status,
                accentColor: org.settings?.accentColor || resolveOrgAccent(org.slug, null),
                welcomeMessage: org.settings?.welcomeMessage || null,
                logoUrl: org.settings?.logoUrl || null,
                bannerUrl: org.settings?.bannerUrl || null,
                joinLayout: org.settings?.joinLayout || 'standard',
                faviconUrl: org.settings?.faviconUrl || null,
            },
        };
    }

    async function joinByCode({ code, userId } = {}) {
        const uid = String(userId || '').trim();
        if (!uid) {
            const err = new Error('userId is required');
            err.code = 'invalid_member';
            throw err;
        }

        const preview = await previewJoinCode(code);
        const { cohort, org } = preview;

        const fullOrg = await orgsRepo.findById(org.id);
        if (fullOrg?.settings?.allowPublicOptIn === false) {
            await usersRepo.updateIdentity(uid, { public_access: false });
        }

        let orgMembership = await orgMembershipsRepo.findMembership(org.id, uid);
        const isNewSeat = !(orgMembership && orgMembership.status === 'active');

        if (isNewSeat) {
            const seatsUsed = await orgMembershipsRepo.countSeats(org.id);
            if (seatsUsed >= (fullOrg?.seatCap || 0)) {
                const err = new Error('Org seat cap reached');
                err.code = 'seat_cap';
                throw err;
            }
            orgMembership = await orgMembershipsRepo.upsertMember({
                orgId: org.id,
                userId: uid,
                role: 'student',
                status: 'active',
                seatCounts: seatCountsForRole('student'),
            });
        }

        const existingCohort = await cohortMembershipsRepo.find(cohort.id, uid);

        if (!(existingCohort && existingCohort.status === 'active')) {
            await assertNoOtherCohortInOrg({
                orgId: org.id,
                userId: uid,
                cohortId: cohort.id,
            });
        }

        const cohortMembership = await cohortMembershipsRepo.upsert({
            cohortId: cohort.id,
            orgId: org.id,
            userId: uid,
            status: 'active',
        });

        const enrolled = await enrollStudentInCohortPrograms({
            cohort,
            orgId: org.id,
            userId: uid,
        });

        return {
            org: await orgsRepo.findById(org.id),
            cohort: await withCounts(cohort),
            orgMembership,
            cohortMembership,
            alreadyInCohort: Boolean(existingCohort && existingCohort.status === 'active'),
            enrolled,
        };
    }

    return {
        createCohort,
        listCohorts,
        getCohort,
        updateCohort,
        previewJoinCode,
        joinByCode,
        assignStudentToCohort,
        withCounts,
    };
}

const defaults = createCohortsService();

module.exports = {
    createCohortsService,
    createCohort: defaults.createCohort,
    listCohorts: defaults.listCohorts,
    getCohort: defaults.getCohort,
    updateCohort: defaults.updateCohort,
    previewJoinCode: defaults.previewJoinCode,
    joinByCode: defaults.joinByCode,
    assignStudentToCohort: defaults.assignStudentToCohort,
};
