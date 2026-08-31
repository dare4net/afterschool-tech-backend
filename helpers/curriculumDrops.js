const defaultRepo = require('../repositories/curriculumRepo');
const { notify: defaultNotify } = require('./notify');
const { log } = require('./logger');

const FANOUT_CAP = 200;

function isLive(doc) {
    if (!doc) return false;
    if (doc.is_deleted === true) return false;
    return doc.is_published !== false;
}

function becameLive(before, after) {
    return isLive(after) && !isLive(before);
}

function publishFlagChanged(before, after) {
    return isLive(before) !== isLive(after);
}

function programHref(programId, moduleId) {
    const program = encodeURIComponent(String(programId));
    if (!moduleId) return `/dashboard/student/programs/${program}`;
    return `/dashboard/student/programs/${program}/modules/${encodeURIComponent(String(moduleId))}`;
}

function programName(program) {
    return (program && (program.name || program.program_name || program.title)) || 'your course';
}

function createCurriculumDrops({
    curriculumRepo = defaultRepo,
    notify = defaultNotify,
} = {}) {
    async function publishedLessons(programId) {
        const program = await curriculumRepo.findProgram(programId);
        if (!isLive(program)) return { program, modules: [], lessons: [] };
        const modules = (await curriculumRepo.listModulesForProgram(programId)).filter(isLive);
        const lessons = (await curriculumRepo.listLessonsForModules(modules.map((mod) => mod._id))).filter(isLive);
        const liveModuleIds = new Set(modules.map((mod) => String(mod._id)));
        return {
            program,
            modules,
            lessons: lessons.filter((lesson) => liveModuleIds.has(String(lesson.module_id))),
        };
    }

    async function computeProgress(userId, programId) {
        const { modules, lessons } = await publishedLessons(programId);
        const publishedCount = lessons.length;
        if (!userId || publishedCount === 0) {
            return {
                percent_complete: 0,
                published_lessons: publishedCount,
                completed_published_lessons: 0,
                completed_modules: [],
            };
        }
        const completedIds = new Set(await curriculumRepo.listCompletedLessonIds(userId, lessons.map((row) => row._id)));
        const completedCount = lessons.filter((lesson) => completedIds.has(String(lesson._id))).length;
        const completedModules = modules.filter((mod) => {
            const moduleLessons = lessons.filter((lesson) => String(lesson.module_id) === String(mod._id));
            return moduleLessons.length > 0 && moduleLessons.every((lesson) => completedIds.has(String(lesson._id)));
        }).map((mod) => mod._id);
        return {
            percent_complete: Math.round((completedCount / publishedCount) * 100),
            published_lessons: publishedCount,
            completed_published_lessons: completedCount,
            completed_modules: completedModules,
        };
    }

    async function persistProgress(userId, programId) {
        const progress = await computeProgress(userId, programId);
        await curriculumRepo.updateRegistrationProgress(userId, programId, {
            'progress.percent_complete': progress.percent_complete,
            'progress.published_lessons': progress.published_lessons,
            'progress.completed_published_lessons': progress.completed_published_lessons,
            'progress.completed_modules': progress.completed_modules,
            last_activity: new Date(),
        });
        return progress;
    }

    async function progressForUser(userId, programId) {
        try {
            return await computeProgress(userId, programId);
        } catch (err) {
            log('warn', 'curriculum_progress_failed', { msg: err.message });
            return null;
        }
    }

    async function recalcProgram(programId) {
        let ids = [];
        try {
            ids = await curriculumRepo.listEnrolledUserIds(programId);
        } catch (err) {
            log('warn', 'curriculum_recalc_enrolled_failed', { msg: err.message });
            return;
        }
        for (const userId of ids.slice(0, FANOUT_CAP)) {
            try {
                await persistProgress(userId, programId);
            } catch (err) {
                log('warn', 'curriculum_recalc_one_failed', { msg: err.message });
            }
        }
    }

    async function notifyEnrolled({ programId, actorId, type, title, body, href, payload }) {
        let ids = [];
        try {
            ids = await curriculumRepo.listEnrolledUserIds(programId);
        } catch (err) {
            log('warn', 'curriculum_fanout_failed', { msg: err.message });
            return { notified: 0 };
        }
        let notified = 0;
        for (const userId of ids.slice(0, FANOUT_CAP)) {
            if (actorId && userId === actorId) continue;
            try {
                await notify({
                    userId,
                    actorId: actorId || null,
                    type,
                    title,
                    body,
                    href,
                    payload: payload || {},
                });
                notified += 1;
            } catch (err) {
                log('warn', 'curriculum_fanout_one_failed', { msg: err.message });
            }
        }
        return { notified };
    }

    async function onLessonPublished({ program, module, lesson, actorId }) {
        if (!isLive(program) || !isLive(module) || !isLive(lesson)) return { notified: 0 };
        const programId = program._id;
        const title = `New lesson: ${lesson.title || 'Untitled'}`;
        const body = `A new lesson dropped in ${programName(program)}`;
        const href = programHref(programId, module._id);
        const result = await notifyEnrolled({
            programId,
            actorId,
            type: 'PROGRAM_LESSON_PUBLISHED',
            title,
            body,
            href,
            payload: {
                programId: String(programId),
                moduleId: String(module._id),
                lessonId: String(lesson._id),
            },
        });
        await recalcProgram(programId);
        return result;
    }

    async function onModulePublished({ program, module, actorId }) {
        if (!isLive(program) || !isLive(module)) return { notified: 0 };
        const programId = program._id;
        const title = `New module: ${module.name || module.title || 'Untitled'}`;
        const body = `New curriculum is live in ${programName(program)}`;
        const href = programHref(programId, module._id);
        const result = await notifyEnrolled({
            programId,
            actorId,
            type: 'PROGRAM_MODULE_PUBLISHED',
            title,
            body,
            href,
            payload: {
                programId: String(programId),
                moduleId: String(module._id),
            },
        });
        await recalcProgram(programId);
        return result;
    }

    async function handleLessonWrite({ before, after, module, program, actorId }) {
        if (becameLive(before, after) && isLive(module) && isLive(program)) {
            return onLessonPublished({ program, module, lesson: after, actorId });
        }
        if (publishFlagChanged(before, after)) {
            await recalcProgram(program && program._id);
        }
        return { notified: 0 };
    }

    async function handleModuleWrite({ before, after, program, actorId }) {
        if (becameLive(before, after) && isLive(program)) {
            return onModulePublished({ program, module: after, actorId });
        }
        if (publishFlagChanged(before, after)) {
            await recalcProgram(program && program._id);
        }
        return { notified: 0 };
    }

    async function handleProgramWrite({ before, after }) {
        if (publishFlagChanged(before, after) && after && after._id) {
            await recalcProgram(after._id);
        }
        return { notified: 0 };
    }

    return {
        publishedLessons,
        computeProgress,
        persistProgress,
        progressForUser,
        recalcProgram,
        notifyEnrolled,
        onLessonPublished,
        onModulePublished,
        handleLessonWrite,
        handleModuleWrite,
        handleProgramWrite,
    };
}

const defaults = createCurriculumDrops();

module.exports = {
    FANOUT_CAP,
    isLive,
    becameLive,
    programHref,
    programName,
    createCurriculumDrops,
    ...defaults,
};
