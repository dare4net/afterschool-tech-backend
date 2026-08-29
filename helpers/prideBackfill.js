const { sanitizeTypeKey } = require('./platformMissions');
const { PRIDE_CATALOG, typeCompletedKey, getPrideStat } = require('./prideCatalog');

/** Time boards need first-attempt live duration. That was never stored historically. */
function skippedPrideKeys() {
    return PRIDE_CATALOG.filter((spec) => spec.sort === 'asc').map((spec) => spec.key);
}

/**
 * Rebuild count boards from student_progress + enroll/completion totals.
 * Does not invent fastest-live times or first-attempt flags we never persisted.
 */
function reconstructPrideCounts({
    progress = {},
    lessonsCompleted = 0,
    programsEnrolled = 0,
    achievementsEarned = 0,
    followers = 0,
} = {}) {
    const byType = {};
    const bag = progress.submitsByType && typeof progress.submitsByType === 'object'
        ? progress.submitsByType
        : {};
    for (const [rawType, data] of Object.entries(bag)) {
        const type = sanitizeTypeKey(rawType);
        if (!type) continue;
        const total = Number(data && data.total) || 0;
        if (total > 0) byType[type] = total;
    }

    return {
        liveCompleted: Number(progress.liveSubmits) || 0,
        perfectFirstTries: Number(progress.perfectSubmits) || 0,
        lessonsCompleted: Math.max(Number(progress.lessonsCompleted) || 0, Number(lessonsCompleted) || 0),
        programsEnrolled: Number(programsEnrolled) || 0,
        currentStreak: Number(progress.consecutiveCorrect) || 0,
        missionsClaimed: Array.isArray(progress.completedMissions) ? progress.completedMissions.length : 0,
        lifetimeStars: Number(progress.lifetimeStarsEarned) || 0,
        achievementsEarned: Number(achievementsEarned) || 0,
        followers: Number(followers) || 0,
        byType,
    };
}

function countOpsFrom(counts) {
    const ops = [];
    for (const [type, total] of Object.entries(counts.byType || {})) {
        const key = typeCompletedKey(type);
        if (getPrideStat(key)) ops.push({ key, value: Number(total) || 0 });
    }
    ops.push({ key: 'liveCompleted', value: Number(counts.liveCompleted) || 0 });
    ops.push({ key: 'perfectFirstTries', value: Number(counts.perfectFirstTries) || 0 });
    ops.push({ key: 'lessonsCompleted', value: Number(counts.lessonsCompleted) || 0 });
    ops.push({ key: 'programsEnrolled', value: Number(counts.programsEnrolled) || 0 });
    ops.push({ key: 'missionsClaimed', value: Number(counts.missionsClaimed) || 0 });
    ops.push({ key: 'lifetimeStars', value: Number(counts.lifetimeStars) || 0 });
    ops.push({ key: 'achievementsEarned', value: Number(counts.achievementsEarned) || 0 });
    ops.push({ key: 'followers', value: Number(counts.followers) || 0 });
    return ops.filter((item) => {
        const spec = getPrideStat(item.key);
        return spec && spec.sort !== 'asc';
    });
}

module.exports = {
    skippedPrideKeys,
    reconstructPrideCounts,
    countOpsFrom,
};
