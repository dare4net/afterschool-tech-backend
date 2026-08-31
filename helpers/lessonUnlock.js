const { LESSON_UNLOCK_PROGRESS, LESSON_EARLY_UNLOCK_COST } = require('./starMarket');
const { getMainDb, getLessonsDb } = require('../config/database');
const progressRepo = require('../repositories/progressRepo');
const { resolveLessonRef } = require('./lessonRef');
const curriculumDrops = require('./curriculumDrops');
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

module.exports = {
    LESSON_UNLOCK_PROGRESS,
    LESSON_EARLY_UNLOCK_COST,
    meetsUnlockThreshold,
    applySequentialUnlock,
    earlyUnlockIdsFor,
    fetchLessonLock,
};
