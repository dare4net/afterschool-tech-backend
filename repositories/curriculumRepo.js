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
};
