const { LESSON_UNLOCK_PROGRESS, LESSON_EARLY_UNLOCK_COST } = require('./starMarket');
const { getMainDb, getLessonsDb } = require('../config/database');
const progressRepo = require('../repositories/progressRepo');
const curriculumRepo = require('../repositories/curriculumRepo');
const notifyDedupeRepo = require('../repositories/notifyDedupeRepo');
const { resolveLessonRef } = require('./lessonRef');
const curriculumDrops = require('./curriculumDrops');
const { notify } = require('./notify');
const { log } = require('./logger');
const { ObjectId } = require('mongodb');

function meetsUnlockThreshold(lesson) {
    if (!lesson) return false;
    if (lesson.completed) return true;
    return (Number(lesson.progress) || 0) >= LESSON_UNLOCK_PROGRESS;
}

function lessonUnlockIds(lesson) {
    return [lesson?.lessonId, lesson?.id, lesson?._id]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map(String);
}

function applySequentialUnlock(lessons, earlyUnlockIds = []) {
    const early = new Set((earlyUnlockIds || []).map(String));
    let previousReady = true;
    return (lessons || []).map((lesson, index) => {
        const ids = lessonUnlockIds(lesson);
        const unlockedByStars = ids.some((id) => early.has(id));
        const locked = index > 0 && !previousReady && !unlockedByStars;
        previousReady = meetsUnlockThreshold(lesson);
        return {
            ...lesson,
            locked,
            unlockedByStars,
            unlockCost: LESSON_EARLY_UNLOCK_COST,
        };
    });
}

async function earlyUnlockIdsFor(userId) {
    const progress = await progressRepo.getOrCreate(userId);
    return progress.earlyUnlockLessonIds || [];
}

async function fetchLessonLock(userId, lessonId) {
    const cost = LESSON_EARLY_UNLOCK_COST;
    const ref = await resolveLessonRef(lessonId);
    if (!ref) return { locked: false, cost, lessonId: String(lessonId || '') };

    const publicId = ref.publicId || String(lessonId);
    const catalogId = ref.catalogId ? String(ref.catalogId) : null;
    const early = new Set((await earlyUnlockIdsFor(userId)).map(String));
    if (early.has(publicId) || (catalogId && early.has(catalogId)) || early.has(String(lessonId))) {
        return { locked: false, unlockedByStars: true, cost, lessonId: publicId };
    }

    const catalog = ref.catalog;
    if (!catalog?.module_id || !catalog._id) {
        return { locked: false, cost, lessonId: publicId };
    }

    const db = await getMainDb();
    let siblings = await db.collection('lessons')
        .find({ module_id: catalog.module_id })
        .sort({ order: 1 })
        .toArray();
    siblings = siblings.filter((row) => curriculumDrops.isLive(row));

    const idx = siblings.findIndex((row) => String(row._id) === String(catalog._id));
    if (idx <= 0) return { locked: false, cost, lessonId: publicId };

    const prev = siblings[idx - 1];
    const completion = await db.collection('lesson_completions').findOne({
        user_id: { $in: [userId, String(userId)] },
        lesson_id: prev._id,
    });
    if (completion) return { locked: false, previousProgress: 100, cost, lessonId: publicId };

    let previousProgress = 0;
    if (prev.lesson_data) {
        const lessonsDb = await getLessonsDb();
        const dataId = prev.lesson_data instanceof ObjectId ? prev.lesson_data : prev.lesson_data;
        const ast = await lessonsDb.collection('lessons').findOne({
            $or: [{ _id: dataId }, { id: String(prev.lesson_data) }],
        });
        const astId = ast?.id || String(prev.lesson_data);
        const interaction = await lessonsDb.collection('interactions').findOne({
            userId: String(userId),
            lessonId: astId,
        });
        previousProgress = Number(interaction?.lessonState?.progress) || 0;
    }

    return {
        locked: previousProgress < LESSON_UNLOCK_PROGRESS,
        previousProgress,
        cost,
        lessonId: publicId,
    };
}

async function listLiveSiblings(moduleId) {
    if (!moduleId) return [];
    const db = await getMainDb();
    const siblings = await db.collection('lessons')
        .find({ module_id: moduleId })
        .sort({ order: 1 })
        .toArray();
    return siblings.filter((row) => curriculumDrops.isLive(row));
}

function lessonLabel(lesson) {
    return (lesson && (lesson.title || lesson.name)) || 'the next lesson';
}

async function notifyLessonOpened(userId, lesson, { via }) {
    if (!userId || !lesson) return null;
    const lessonKey = String(lesson._id || lesson.lessonId || '');
    if (!lessonKey) return null;
    const claimed = await notifyDedupeRepo.claimOnce(`unlock:${userId}:${lessonKey}`);
    if (!claimed) return null;
    const module = lesson.module_id ? await curriculumRepo.findModule(lesson.module_id) : null;
    const program = module && module.program_id ? await curriculumRepo.findProgram(module.program_id) : null;
    const href = program
        ? curriculumDrops.programHref(program._id, module._id)
        : '/dashboard/student';
    const title = `${lessonLabel(lesson)} is unlocked`;
    const body = via === 'stars'
        ? 'You opened it with stars. It is ready when you are.'
        : 'You hit 50% — the next lesson is open.';
    return notify({
        userId,
        type: 'NEXT_LESSON_UNLOCKED',
        title,
        body,
        href,
        payload: {
            lessonId: String(lesson._id),
            via,
        },
    });
}

async function notifyIfProgressUnlockedNext(userId, lessonId, previousProgress, nextProgress) {
    try {
        if ((Number(previousProgress) || 0) >= LESSON_UNLOCK_PROGRESS) return null;
        if ((Number(nextProgress) || 0) < LESSON_UNLOCK_PROGRESS) return null;
        const ref = await resolveLessonRef(lessonId);
        if (!ref || !ref.catalog || !ref.catalog.module_id) return null;
        const siblings = await listLiveSiblings(ref.catalog.module_id);
        const idx = siblings.findIndex((row) => String(row._id) === String(ref.catalog._id));
        if (idx < 0 || idx >= siblings.length - 1) return null;
        return notifyLessonOpened(userId, siblings[idx + 1], { via: 'progress' });
    } catch (err) {
        log('warn', 'unlock_notify_progress_failed', { msg: err.message });
        return null;
    }
}

async function notifyIfStarUnlocked(userId, lessonId, alreadyUnlocked) {
    try {
        if (alreadyUnlocked) return null;
        const ref = await resolveLessonRef(lessonId);
        if (!ref || !ref.catalog) return null;
        return notifyLessonOpened(userId, ref.catalog, { via: 'stars' });
    } catch (err) {
        log('warn', 'unlock_notify_stars_failed', { msg: err.message });
        return null;
    }
}

module.exports = {
    LESSON_UNLOCK_PROGRESS,
    LESSON_EARLY_UNLOCK_COST,
    meetsUnlockThreshold,
    applySequentialUnlock,
    earlyUnlockIdsFor,
    fetchLessonLock,
    notifyIfProgressUnlockedNext,
    notifyIfStarUnlocked,
};
