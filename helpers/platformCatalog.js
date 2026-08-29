const catalogRepo = require('../repositories/catalogRepo');
const { allocateCatalogId } = require('./catalogIds');
const { PLATFORM_MISSIONS, sanitizeMission, sanitizeFilters, getMissionById, missionsForLevel } = require('./platformMissions');
const {
    PLATFORM_ACHIEVEMENTS,
    sanitizeAchievement,
    catalogPublicFields,
} = require('./platformAchievements');
const { log } = require('./logger');

let seedPromise = null;

function seedMissionDocs() {
    return PLATFORM_MISSIONS.map((m) => ({
        id: m.id,
        level: m.level,
        title: m.title,
        description: m.description,
        targetCount: m.targetCount,
        rewardStars: m.rewardStars,
        stat: m.stat,
        ...(m.filters ? { filters: m.filters } : {}),
        enabled: m.enabled !== false,
    }));
}

function seedAchievementDocs() {
    return PLATFORM_ACHIEVEMENTS.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        icon: a.icon,
        rewardStars: a.rewardStars,
        eventType: a.eventType,
        enabled: a.enabled !== false,
        rules: a.rules,
    }));
}

async function ensureSeeded() {
    if (!seedPromise) {
        seedPromise = (async () => {
            await catalogRepo.ensureIndexes();
            await catalogRepo.seedIfMissing(catalogRepo.missionsCol, seedMissionDocs());
            await catalogRepo.seedIfMissing(catalogRepo.achievementsCol, seedAchievementDocs());
        })().catch((err) => {
            seedPromise = null;
            log('warn', 'catalog_seed_failed', { msg: err.message });
            throw err;
        });
    }
    return seedPromise;
}

async function tryCatalog(fn, fallback) {
    try {
        await ensureSeeded();
        return await fn();
    } catch (err) {
        log('warn', 'catalog_fallback', { msg: err.message });
        return fallback();
    }
}

async function listMissions({ includeDisabled = false } = {}) {
    return tryCatalog(async () => {
        const filter = includeDisabled ? {} : { enabled: { $ne: false } };
        const docs = await catalogRepo.listMissions(filter);
        if (!docs.length) {
            return PLATFORM_MISSIONS
                .filter((m) => includeDisabled || m.enabled !== false)
                .map(sanitizeMission);
        }
        return docs.map(sanitizeMission);
    }, () => PLATFORM_MISSIONS
        .filter((m) => includeDisabled || m.enabled !== false)
        .map(sanitizeMission));
}

async function getMission(id) {
    return tryCatalog(async () => {
        const doc = await catalogRepo.findMission(id);
        return doc ? sanitizeMission(doc) : getMissionById(id);
    }, () => getMissionById(id));
}

async function missionsForLevelAsync(level) {
    const all = await listMissions({ includeDisabled: false });
    const fromCatalog = all.filter((m) => m.level === level);
    if (fromCatalog.length) return fromCatalog;
    return missionsForLevel(level);
}

function pickDefined(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
}

async function createMission(input) {
    await ensureSeeded();
    const existingDocs = await catalogRepo.listMissions({});
    const existingIds = existingDocs.map((doc) => doc.id).filter(Boolean);
    const id = input.id || allocateCatalogId({
        kind: 'mission',
        title: input.title,
        level: input.level,
        existingIds,
    });
    if (existingIds.includes(id)) {
        return { error: 'Mission id already exists', status: 409 };
    }
    const record = await catalogRepo.insertMission({
        id,
        level: input.level,
        title: input.title,
        description: input.description,
        targetCount: input.targetCount,
        rewardStars: input.rewardStars,
        stat: input.stat,
        filters: sanitizeFilters(input.filters) || null,
        enabled: input.enabled !== false,
    });
    return { mission: sanitizeMission(record) };
}

async function patchMission(id, input) {
    await ensureSeeded();
    const updated = await catalogRepo.updateMission(id, pickDefined({
        level: input.level,
        title: input.title,
        description: input.description,
        targetCount: input.targetCount,
        rewardStars: input.rewardStars,
        stat: input.stat,
        filters: Object.prototype.hasOwnProperty.call(input, 'filters')
            ? (sanitizeFilters(input.filters) || null)
            : undefined,
        enabled: input.enabled,
    }));
    const doc = updated && (updated.value || updated);
    if (!doc || !doc.id) {
        return { error: 'Mission not found', status: 404 };
    }
    return { mission: sanitizeMission(doc) };
}

async function removeMission(id) {
    await ensureSeeded();
    const result = await catalogRepo.deleteMission(id);
    if (!result.deletedCount) {
        return { error: 'Mission not found', status: 404 };
    }
    return { success: true };
}

async function listAchievements({ includeDisabled = false } = {}) {
    return tryCatalog(async () => {
        const filter = includeDisabled ? {} : { enabled: { $ne: false } };
        const docs = await catalogRepo.listAchievements(filter);
        if (!docs.length) {
            return PLATFORM_ACHIEVEMENTS
                .filter((a) => includeDisabled || a.enabled !== false)
                .map(sanitizeAchievement);
        }
        return docs.map(sanitizeAchievement);
    }, () => PLATFORM_ACHIEVEMENTS
        .filter((a) => includeDisabled || a.enabled !== false)
        .map(sanitizeAchievement));
}

async function createAchievement(input) {
    await ensureSeeded();
    const existingDocs = await catalogRepo.listAchievements({});
    const existingIds = existingDocs.map((doc) => doc.id).filter(Boolean);
    const id = input.id || allocateCatalogId({
        kind: 'achievement',
        title: input.title,
        existingIds,
    });
    if (existingIds.includes(id)) {
        return { error: 'Achievement id already exists', status: 409 };
    }
    const record = await catalogRepo.insertAchievement({
        id,
        title: input.title,
        description: input.description,
        icon: input.icon,
        rewardStars: input.rewardStars,
        eventType: input.eventType,
        enabled: input.enabled !== false,
        rules: input.rules,
    });
    return { achievement: sanitizeAchievement(record) };
}

async function patchAchievement(id, input) {
    await ensureSeeded();
    const updated = await catalogRepo.updateAchievement(id, pickDefined({
        title: input.title,
        description: input.description,
        icon: input.icon,
        rewardStars: input.rewardStars,
        eventType: input.eventType,
        enabled: input.enabled,
        rules: input.rules,
    }));
    const doc = updated && (updated.value || updated);
    if (!doc || !doc.id) {
        return { error: 'Achievement not found', status: 404 };
    }
    return { achievement: sanitizeAchievement(doc) };
}

async function removeAchievement(id) {
    await ensureSeeded();
    const result = await catalogRepo.deleteAchievement(id);
    if (!result.deletedCount) {
        return { error: 'Achievement not found', status: 404 };
    }
    return { success: true };
}

function publicAchievement(ach) {
    return catalogPublicFields(ach);
}

module.exports = {
    ensureSeeded,
    listMissions,
    getMission,
    missionsForLevel: missionsForLevelAsync,
    createMission,
    patchMission,
    removeMission,
    listAchievements,
    createAchievement,
    patchAchievement,
    removeAchievement,
    publicAchievement,
};
