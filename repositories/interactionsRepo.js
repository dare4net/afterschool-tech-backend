const { getLessonsDb, getMainDb } = require('../config/database');
const { decideWrite, versionMatchFilter } = require('../helpers/optimisticVersion');

async function interactions() {
    return (await getLessonsDb()).collection('interactions');
}

async function findByUserAndLesson(userId, lessonId) {
    return (await interactions()).findOne({ userId, lessonId });
}

async function upsertProgress(userId, lessonId, { componentsState, lessonState, attemptsMap, version }) {
    const col = await interactions();
    const existing = await col.findOne({ userId, lessonId });
    const decision = decideWrite(existing, version);
    if (decision.action === 'conflict') {
        return { ok: false, conflict: true, version: decision.version, existing };
    }

    const set = {
        componentsState,
        lessonState,
        lastActiveAt: new Date(),
        lastUpdated: new Date(),
        version: decision.version,
    };
    if (attemptsMap !== undefined) {
        set.attemptsMap = attemptsMap;
    }

    if (decision.action === 'insert') {
        const result = await col.insertOne({
            userId,
            lessonId,
            ...set,
        });
        return { ok: true, conflict: false, version: decision.version, upsertedId: result.insertedId };
    }

    const result = await col.updateOne(
        { userId, lessonId, ...versionMatchFilter(existing) },
        { $set: set }
    );
    if (result.matchedCount === 0) {
        const raced = await col.findOne({ userId, lessonId });
        return {
            ok: false,
            conflict: true,
            version: raced ? (Number.isFinite(Number(raced.version)) ? Number(raced.version) : 0) : decision.version,
            existing: raced,
        };
    }
    return { ok: true, conflict: false, version: decision.version, upsertedId: existing?._id };
}

async function touchProgramActivity(userId) {
    try {
        await (await getMainDb()).collection('program_registrations').updateMany(
            { user_id: userId },
            { $set: { last_activity: new Date() } }
        );
    } catch (err) {
        console.error('[TELEMETRY] Failed to update telemetry last_activity:', err);
    }
}

async function deleteByUserAndLesson(userId, lessonId) {
    if (!userId || !lessonId) return { deletedCount: 0 };
    const result = await (await interactions()).deleteMany({ userId, lessonId });
    return { deletedCount: result.deletedCount || 0 };
}

async function clearComponent(userId, lessonId, componentId) {
    if (!userId || !lessonId || !componentId) return { ok: false };
    const col = await interactions();
    const existing = await col.findOne({ userId, lessonId });
    if (!existing) return { ok: true, missing: true, version: 0 };
    const version = (Number(existing.version) || 0) + 1;
    await col.updateOne(
        { userId, lessonId },
        {
            $unset: {
                [`componentsState.${componentId}`]: '',
                [`attemptsMap.${componentId}`]: '',
            },
            $set: { lastUpdated: new Date(), version },
        }
    );
    return { ok: true, version };
}

module.exports = {
    findByUserAndLesson,
    upsertProgress,
    touchProgramActivity,
    deleteByUserAndLesson,
    clearComponent,
};
