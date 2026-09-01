const { ObjectId } = require('mongodb');
const { getMainDb } = require('../config/database');

const PROGRAMS = 'programs';
const MODULES = 'modules';
const LESSONS = 'lessons';
const REGISTRATIONS = 'program_registrations';
const COMPLETIONS = 'lesson_completions';

function asObjectId(value) {
    if (!value) return null;
    if (value instanceof ObjectId) return value;
    const text = String(value);
    if (!/^[a-fA-F0-9]{24}$/.test(text)) return null;
    try {
        return new ObjectId(text);
    } catch {
        return null;
    }
}

function uniqueIds(values) {
    const seen = new Set();
    const out = [];
    for (const value of values || []) {
        const id = asObjectId(value);
        if (!id) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(id);
    }
    return out;
}

async function main() {
    return getMainDb();
}

async function findProgram(programId) {
    const id = asObjectId(programId);
    if (!id) return null;
    return (await main()).collection(PROGRAMS).findOne({ _id: id });
}

async function findModule(moduleId) {
    const id = asObjectId(moduleId);
    if (!id) return null;
    return (await main()).collection(MODULES).findOne({ _id: id });
}

async function findLesson(lessonId) {
    const id = asObjectId(lessonId);
    if (!id) return null;
    return (await main()).collection(LESSONS).findOne({ _id: id });
}

async function listModulesForProgram(programId) {
    const program = await findProgram(programId);
    if (!program) return [];
    const fromArray = uniqueIds(program.modules);
    if (fromArray.length > 0) {
        return (await main()).collection(MODULES)
            .find({ _id: { $in: fromArray } })
            .toArray();
    }
    return (await main()).collection(MODULES)
        .find({ program_id: program._id })
        .toArray();
}

async function listLessonsForModules(moduleIds) {
    const ids = uniqueIds(moduleIds);
    if (ids.length === 0) return [];
    return (await main()).collection(LESSONS)
        .find({ module_id: { $in: ids } })
        .project({ _id: 1, module_id: 1, title: 1, is_published: 1, is_deleted: 1 })
        .toArray();
}

async function listEnrolledUserIds(programId) {
    const id = asObjectId(programId);
    if (!id) return [];
    const rows = await (await main()).collection(REGISTRATIONS)
        .find({ program_id: id, status: { $ne: 'unenrolled' } })
        .project({ user_id: 1, student_id: 1 })
        .toArray();
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        const userId = row.user_id || row.student_id;
        if (!userId) continue;
        const key = String(userId);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}

async function listCompletedLessonIds(userId, lessonIds) {
    const ids = uniqueIds(lessonIds);
    if (!userId || ids.length === 0) return [];
    const rows = await (await main()).collection(COMPLETIONS)
        .find({ user_id: userId, lesson_id: { $in: ids } })
        .project({ lesson_id: 1 })
        .toArray();
    return rows.map((row) => String(row.lesson_id));
}

async function updateRegistrationProgress(userId, programId, fields) {
    const id = asObjectId(programId);
    if (!userId || !id || !fields) return;
    await (await main()).collection(REGISTRATIONS).updateOne(
        { user_id: userId, program_id: id },
        { $set: fields }
    );
}

async function listUnfinishedRegistrations({ before, cap = 1500 } = {}) {
    const filter = {
        status: { $ne: 'unenrolled' },
        'progress.percent_complete': { $gt: 0, $lt: 100 },
    };
    if (before) {
        filter.$or = [
            { last_activity: { $lt: before } },
            { last_activity: { $exists: false } },
            { last_activity: null },
        ];
    }
    return (await main()).collection(REGISTRATIONS)
        .find(filter)
        .project({ user_id: 1, program_id: 1, last_activity: 1, progress: 1, status: 1 })
        .limit(Math.max(1, Number(cap) || 1500))
        .toArray();
}

async function findProgramsByIds(programIds) {
    const ids = uniqueIds(programIds);
    if (!ids.length) return [];
    return (await main()).collection(PROGRAMS)
        .find({ _id: { $in: ids } })
        .project({ _id: 1, name: 1, program_name: 1, title: 1 })
        .toArray();
}

/**
 * Idempotent enrol. Adds org/cohort attribution when provided.
 * Keeps unique (user_id, program_id) behaviour from the existing register path.
 */
async function ensureRegistration({
    userId,
    programId,
    orgId = null,
    cohortId = null,
    source = 'self',
} = {}) {
    const uid = String(userId || '').trim();
    const pid = asObjectId(programId);
    if (!uid || !pid) return { created: false, registration: null };

    const db = await main();
    const existing = await db.collection(REGISTRATIONS).findOne({
        program_id: pid,
        user_id: uid,
    });
    if (existing) {
        const $set = { last_activity: new Date() };
        if (orgId && !existing.org_id) $set.org_id = asObjectId(orgId);
        if (cohortId && !existing.cohort_id) $set.cohort_id = asObjectId(cohortId);
        if (source && !existing.source) $set.source = source;
        if (Object.keys($set).length > 1) {
            await db.collection(REGISTRATIONS).updateOne({ _id: existing._id }, { $set });
        }
        return { created: false, registration: existing };
    }

    const program = await findProgram(pid);
    if (!program) return { created: false, registration: null };

    const registration = {
        program_id: pid,
        user_id: uid,
        status: 'active',
        progress: {
            completed_modules: [],
            completed_milestones: [],
            current_module: program.modules && program.modules.length > 0
                ? asObjectId(program.modules[0])
                : null,
        },
        registered_at: new Date(),
        last_activity: new Date(),
        source: source || 'self',
    };
    const oid = asObjectId(orgId);
    const cid = asObjectId(cohortId);
    if (oid) registration.org_id = oid;
    if (cid) registration.cohort_id = cid;

    await db.collection(REGISTRATIONS).insertOne(registration);
    await db.collection('users').updateOne(
        { user_id: uid },
        { $addToSet: { programs: pid }, $set: { updated_at: new Date() } }
    );
    return { created: true, registration };
}

async function countActiveRegistrations(userId, { orgScope = 'any' } = {}) {
    const uid = String(userId || '').trim();
    if (!uid) return 0;
    const base = { user_id: uid, status: { $ne: 'unenrolled' } };
    if (orgScope === 'personal') {
        return (await main()).collection(REGISTRATIONS).countDocuments({
            ...base,
            $or: [{ org_id: null }, { org_id: { $exists: false } }],
        });
    }
    if (orgScope === 'club') {
        return (await main()).collection(REGISTRATIONS).countDocuments({
            ...base,
            org_id: { $exists: true, $ne: null },
        });
    }
    return (await main()).collection(REGISTRATIONS).countDocuments(base);
}

module.exports = {
    PROGRAMS,
    MODULES,
    LESSONS,
    REGISTRATIONS,
    COMPLETIONS,
    asObjectId,
    findProgram,
    findModule,
    findLesson,
    listModulesForProgram,
    listLessonsForModules,
    listEnrolledUserIds,
    listCompletedLessonIds,
    updateRegistrationProgress,
    listUnfinishedRegistrations,
    findProgramsByIds,
    ensureRegistration,
    countActiveRegistrations,
};
