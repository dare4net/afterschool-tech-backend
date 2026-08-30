const { SCORED_COMPONENT_TYPES } = require('../contracts/platform');

const MAX_STARS_PER_LIVE_BLOCK = 7;

const STORE_ITEMS = {
    live_time: {
        sku: 'live_time',
        name: 'Extra Time',
        kind: 'live',
        description: 'Add seconds to the live timer on the block you are playing.',
        maxLevel: 5,
        chargeCost: 20,
        upgradeBase: 40,
        effectLabel: 'seconds',
        effectAt: (level) => 8 + (level - 1) * 6,
    },
    live_freeze: {
        sku: 'live_freeze',
        name: 'Freeze Clock',
        kind: 'live',
        description: 'Pause the live timer so you can think.',
        maxLevel: 5,
        chargeCost: 25,
        upgradeBase: 50,
        effectLabel: 'seconds paused',
        effectAt: (level) => 4 + (level - 1) * 3,
    },
    star_surge: {
        sku: 'star_surge',
        name: 'Star Surge',
        kind: 'buff',
        description: 'Bonus stars on your next live completion.',
        maxLevel: 5,
        chargeCost: 35,
        upgradeBase: 70,
        effectLabel: 'bonus stars',
        effectAt: (level) => level,
    },
    second_chance: {
        sku: 'second_chance',
        name: 'Second Wind',
        kind: 'live',
        description: 'Add another full timer to the current live block.',
        maxLevel: 3,
        chargeCost: 45,
        upgradeBase: 90,
        effectLabel: 'timer refreshes',
        effectAt: (level) => level,
    },
    focus_shield: {
        sku: 'focus_shield',
        name: 'Focus Shield',
        kind: 'buff',
        description: 'Ignore the timeout penalty on your next timeout.',
        maxLevel: 1,
        chargeCost: 15,
        upgradeBase: 0,
        effectLabel: 'shields',
        effectAt: () => 1,
    },
    streak_freeze: {
        sku: 'streak_freeze',
        name: 'Streak Freeze',
        kind: 'buff',
        description: 'Protect your login streak for a missed day.',
        maxLevel: 2,
        chargeCost: 50,
        upgradeBase: 120,
        effectLabel: 'freezes stored',
        effectAt: (level) => level,
    },
};

function getItem(sku) {
    return STORE_ITEMS[String(sku || '')] || null;
}

function upgradeCost(item, currentLevel) {
    if (!item || item.upgradeBase <= 0) return null;
    if (currentLevel >= item.maxLevel) return null;
    return item.upgradeBase * (2 ** (currentLevel - 1));
}

function chargeCost(item) {
    return item ? item.chargeCost : 0;
}

function isLiveComponent(comp) {
    if (!comp) return false;
    if (comp.mode === 'live' || comp.props?.mode === 'live') return true;
    return Number(comp.props?.timeLimit) > 0;
}

function countLiveScoredBlocks(content) {
    const scored = new Set(SCORED_COMPONENT_TYPES);
    let count = 0;
    for (const slide of content?.slides || []) {
        for (const comp of slide.components || []) {
            if (scored.has(comp.type) && isLiveComponent(comp)) count += 1;
        }
    }
    return count;
}

function maxStarsForLesson(content) {
    return countLiveScoredBlocks(content) * MAX_STARS_PER_LIVE_BLOCK;
}

function lessonResetCost(content) {
    const maxStars = maxStarsForLesson(content);
    return Math.max(21, Math.ceil(maxStars * 1.5));
}

function publicItem(item, inventoryItem = {}) {
    const level = Math.max(1, Number(inventoryItem.level) || 1);
    return {
        sku: item.sku,
        name: item.name,
        kind: item.kind,
        description: item.description,
        maxLevel: item.maxLevel,
        level,
        charges: Number(inventoryItem.charges) || 0,
        effect: item.effectAt(level),
        effectLabel: item.effectLabel,
        chargeCost: chargeCost(item),
        upgradeCost: upgradeCost(item, level),
        canUpgrade: level < item.maxLevel && item.upgradeBase > 0,
    };
}

module.exports = {
    STORE_ITEMS,
    MAX_STARS_PER_LIVE_BLOCK,
    getItem,
    upgradeCost,
    chargeCost,
    countLiveScoredBlocks,
    maxStarsForLesson,
    lessonResetCost,
    publicItem,
};
