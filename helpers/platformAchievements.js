const { matchesRules } = require('./catalogRules');

const {
    ACHIEVEMENT_EVENT_TYPES,
    ACHIEVEMENT_FIELDS_BY_EVENT,
} = require('../contracts/platform');

const RULE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'ratioLt'];

const PLATFORM_ACHIEVEMENTS = [
    {
        id: 'grid-memory-master',
        title: 'Grid Memory Master',
        description: 'Complete a Memory Grid component in 6 or fewer attempts',
        icon: 'brain',
        rewardStars: 5,
        eventType: 'COMPONENT_SUBMITTED',
        enabled: true,
        rules: [
            { field: 'type', op: 'eq', value: 'memoryGrid' },
            { field: 'attemptCount', op: 'lte', value: 6 },
            { field: 'isFirstAttempt', op: 'eq', value: true },
        ],
    },
    {
        id: 'first-live-star',
        title: 'Star Born',
        description: 'Earn your very first star in Live Mode',
        icon: 'star',
        rewardStars: 2,
        eventType: 'COMPONENT_SUBMITTED',
        enabled: true,
        rules: [
            { field: 'mode', op: 'eq', value: 'live' },
            { field: 'score', op: 'gt', value: 0 },
        ],
    },
    {
        id: 'speed-demon',
        title: 'Speed Demon',
        description: 'Finish a timed live component in under 50% of the time limit',
        icon: 'zap',
        rewardStars: 3,
        eventType: 'LIVE_EARLY_FINISH',
        enabled: true,
        rules: [
            { field: 'completionTimeMs', op: 'exists' },
            { field: 'timeLimitMs', op: 'exists' },
            { field: 'completionTimeMs', op: 'ratioLt', over: 'timeLimitMs', value: 0.5 },
        ],
    },
    {
        id: 'perfect-lesson',
        title: 'Flawless Victory',
        description: 'Complete an entire lesson with a 100% score',
        icon: 'award',
        rewardStars: 10,
        eventType: 'LESSON_COMPLETED',
        enabled: true,
        rules: [
            { field: 'percentage', op: 'eq', value: 100 },
        ],
    },
];

function sanitizeAchievement(doc) {
    if (!doc) return null;
    return {
        id: doc.id,
        title: doc.title || doc.id,
        description: doc.description || '',
        icon: doc.icon || 'award',
        rewardStars: Number(doc.rewardStars) || 0,
        eventType: doc.eventType,
        enabled: doc.enabled !== false,
        rules: Array.isArray(doc.rules) ? doc.rules : [],
    };
}

function getAchievementIds() {
    return PLATFORM_ACHIEVEMENTS.map((a) => a.id);
}

function catalogPublicFields(ach) {
    return {
        id: ach.id,
        title: ach.title,
        description: ach.description,
        icon: ach.icon,
        rewardStars: ach.rewardStars,
    };
}

function achievementMatches(ach, eventType, payload) {
    if (!ach || ach.enabled === false) return false;
    if (ach.eventType !== eventType) return false;
    return matchesRules(payload, ach.rules);
}

module.exports = {
    ACHIEVEMENT_EVENT_TYPES,
    ACHIEVEMENT_FIELDS_BY_EVENT,
    RULE_OPS,
    PLATFORM_ACHIEVEMENTS,
    sanitizeAchievement,
    getAchievementIds,
    catalogPublicFields,
    achievementMatches,
};
