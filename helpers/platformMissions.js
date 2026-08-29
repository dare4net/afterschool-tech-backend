const { MISSION_STAT_KEYS } = require('../contracts/platform');

const PLATFORM_MISSIONS = [
    {
        id: 'l1-enroll-program',
        level: 1,
        title: 'Program Explorer',
        description: 'Enroll in at least 1 program',
        targetCount: 1,
        rewardStars: 3,
        stat: 'programsEnrolled',
        enabled: true,
    },
    {
        id: 'l1-earn-stars',
        level: 1,
        title: 'Star Collector',
        description: 'Earn 5 Stars in Live Mode',
        targetCount: 5,
        rewardStars: 5,
        stat: 'starsEarned',
        enabled: true,
    },
    {
        id: 'l1-reset-component',
        level: 1,
        title: 'Perfectionist',
        description: 'Reset a practice component to challenge your attempt record',
        targetCount: 1,
        rewardStars: 2,
        stat: 'componentsReset',
        enabled: true,
    },
    {
        id: 'l2-spend-stars',
        level: 2,
        title: 'Big Spender',
        description: 'Spend 5 Stars in the Rewards Store',
        targetCount: 5,
        rewardStars: 5,
        stat: 'starsSpent',
        enabled: true,
    },
    {
        id: 'l2-streak-3',
        level: 2,
        title: 'Hat-Trick',
        description: 'Complete 3 components correctly in a row',
        targetCount: 3,
        rewardStars: 10,
        stat: 'consecutiveCorrect',
        enabled: true,
    },
    {
        id: 'l2-review-lesson',
        level: 2,
        title: 'Scholar',
        description: 'Replay or review a completed lesson',
        targetCount: 1,
        rewardStars: 4,
        stat: 'lessonsReviewed',
        enabled: true,
    },
];

function sanitizeTypeKey(type) {
    if (typeof type !== 'string') return '';
    return type.replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
}

function sanitizeFilters(filters) {
    if (!filters || typeof filters !== 'object') return undefined;
    const next = {};
    if (filters.mode === 'live' || filters.mode === 'practice') next.mode = filters.mode;
    const type = sanitizeTypeKey(filters.type);
    if (type) next.type = type;
    if (filters.perfect === true) next.perfect = true;
    return Object.keys(next).length ? next : undefined;
}

function sanitizeMission(doc) {
    if (!doc) return null;
    const filters = sanitizeFilters(doc.filters);
    return {
        id: doc.id,
        level: Number(doc.level) || 1,
        title: doc.title || doc.id,
        description: doc.description || '',
        targetCount: Number(doc.targetCount) || 1,
        rewardStars: Number(doc.rewardStars) || 0,
        stat: doc.stat,
        ...(filters ? { filters } : {}),
        enabled: doc.enabled !== false,
    };
}

function getMissionById(missionId) {
    const found = PLATFORM_MISSIONS.find((m) => m.id === missionId);
    return found ? sanitizeMission(found) : null;
}

function missionsForLevel(level) {
    return PLATFORM_MISSIONS.filter((m) => m.level === level && m.enabled !== false).map(sanitizeMission);
}

function countSubmits(stats, filters = {}) {
    const type = sanitizeTypeKey(filters.type);
    const mode = filters.mode === 'live' || filters.mode === 'practice' ? filters.mode : '';
    const perfect = filters.perfect === true;
    const bag = type ? (stats?.submitsByType?.[type] || {}) : null;

    if (bag) {
        if (perfect && mode) return Number(bag[`perfect${mode === 'live' ? 'Live' : 'Practice'}`]) || 0;
        if (perfect) return Number(bag.perfect) || 0;
        if (mode) return Number(bag[mode]) || 0;
        return Number(bag.total) || 0;
    }
    if (perfect && mode === 'live') return Number(stats?.perfectLiveSubmits) || 0;
    if (perfect && mode === 'practice') return Number(stats?.perfectPracticeSubmits) || 0;
    if (perfect) return Number(stats?.perfectSubmits) || 0;
    if (mode === 'live') return Number(stats?.liveSubmits) || 0;
    if (mode === 'practice') return Number(stats?.practiceSubmits) || 0;
    return Number(stats?.totalSubmits) || 0;
}

function countForMission(missionOrId, stats) {
    const mission = typeof missionOrId === 'string' ? getMissionById(missionOrId) : missionOrId;
    if (!mission || !mission.stat) return 0;
    if (mission.stat === 'submits') return countSubmits(stats, mission.filters || {});
    return Number(stats?.[mission.stat]) || 0;
}

function isMissionEarned(mission, stats) {
    return countForMission(mission, stats) >= (mission.targetCount || 0);
}

module.exports = {
    MISSION_STAT_KEYS,
    PLATFORM_MISSIONS,
    sanitizeTypeKey,
    sanitizeFilters,
    sanitizeMission,
    getMissionById,
    missionsForLevel,
    countSubmits,
    countForMission,
    isMissionEarned,
};
