const { SCORED_COMPONENT_TYPES } = require('../contracts/platform');

function humanizeType(type) {
    const text = String(type || '').replace(/([A-Z])/g, ' $1').trim();
    if (!text) return 'Block';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function typeCompletedKey(type) {
    if (type === 'quiz') return 'quizzesCompleted';
    return `${type}Completed`;
}

function fastestLiveKey(type) {
    return type ? `fastestLive:${type}` : 'fastestLiveMs';
}

function featuredStats() {
    return [
        { key: 'missionsClaimed', label: 'Most missions', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'achievementsEarned', label: 'Most achievements', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'lifetimeStars', label: 'Most lifetime stars', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'followers', label: 'Most followed', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'quizzesCompleted', label: 'Quizzes completed', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'hangmanCompleted', label: 'Hangman finished', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'memoryGridCompleted', label: 'Memory grids finished', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'liveCompleted', label: 'Live completions', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'perfectFirstTries', label: 'Perfect first tries', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'lessonsCompleted', label: 'Lessons finished', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'programsEnrolled', label: 'Programs joined', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'fastestLiveMs', label: 'Fastest live finish', sort: 'asc', unit: 'ms', group: 'featured' },
        { key: 'currentStreak', label: 'Perfect streak', sort: 'desc', unit: 'count', group: 'featured' },
        { key: 'loginStreak', label: 'Login streak', sort: 'desc', unit: 'count', group: 'featured' },
    ];
}

function buildPrideCatalog() {
    const stats = featuredStats();
    const seen = new Set(stats.map((item) => item.key));
    for (const type of SCORED_COMPONENT_TYPES) {
        const completedKey = typeCompletedKey(type);
        if (!seen.has(completedKey)) {
            stats.push({
                key: completedKey,
                label: `${humanizeType(type)} completed`,
                sort: 'desc',
                unit: 'count',
                group: 'type',
            });
            seen.add(completedKey);
        }
        const liveKey = fastestLiveKey(type);
        if (!seen.has(liveKey)) {
            stats.push({
                key: liveKey,
                label: `Fastest live ${humanizeType(type)}`,
                sort: 'asc',
                unit: 'ms',
                group: 'speed',
            });
            seen.add(liveKey);
        }
    }
    return stats;
}

const PRIDE_CATALOG = buildPrideCatalog();
const PRIDE_BY_KEY = new Map(PRIDE_CATALOG.map((item) => [item.key, item]));

function getPrideStat(key) {
    return PRIDE_BY_KEY.get(String(key || '')) || null;
}

function isRankableLiveFinish(payload) {
    if (!payload || payload.mode !== 'live') return false;
    if (payload.isFirstAttempt !== true) return false;
    const ms = Number(payload.completionTimeMs);
    return Number.isFinite(ms) && ms > 0 && ms <= 3600000;
}

function crownForRank(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return null;
}

function betterCrown(left, right) {
    const score = { gold: 3, silver: 2, bronze: 1 };
    const a = score[left] || 0;
    const b = score[right] || 0;
    if (a === 0 && b === 0) return null;
    return a >= b ? left : right;
}

function sortBoard(spec) {
    if (spec && spec.sort === 'asc') return { value: 1, updated_at: 1, user_id: 1 };
    return { value: -1, updated_at: 1, user_id: 1 };
}

function betterFilter(spec, value, updatedAt) {
    if (spec && spec.sort === 'asc') {
        return {
            $or: [
                { value: { $lt: value } },
                { value, updated_at: { $lt: updatedAt } },
            ],
        };
    }
    return {
        $or: [
            { value: { $gt: value } },
            { value, updated_at: { $lt: updatedAt } },
        ],
    };
}

module.exports = {
    SCORED_COMPONENT_TYPES,
    PRIDE_CATALOG,
    typeCompletedKey,
    fastestLiveKey,
    getPrideStat,
    isRankableLiveFinish,
    crownForRank,
    betterCrown,
    sortBoard,
    betterFilter,
    humanizeType,
};
