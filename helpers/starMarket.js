const { SCORED_COMPONENT_TYPES } = require('../contracts/platform');

const MAX_STARS_PER_LIVE_BLOCK = 5;
const CERTIFICATE_PRINT_COST = 5;
const BLOCK_RESET_COST = 10;
const REFERENCE_LIVE_COST = 3;

const PREMIUM_ACCENT_COLORS = ['#14B8A6', '#F472B6', '#0EA5E9'];

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
    hint_pack: {
        sku: 'hint_pack',
        name: 'Hint Pack',
        kind: 'consumable',
        description: 'Extra letter reveals after the free hints run out.',
        maxLevel: 3,
        chargeCost: 8,
        upgradeBase: 24,
        effectLabel: 'extra hints',
        effectAt: (level) => 2 + level,
    },
    live_block_reset: {
        sku: 'live_block_reset',
        name: 'Block Reset',
        kind: 'consumable',
        description: 'Wipe one live block so you can try it again.',
        maxLevel: 1,
        chargeCost: 10,
        upgradeBase: 0,
        effectLabel: 'block resets',
        effectAt: () => 1,
    },
    reference_credit: {
        sku: 'reference_credit',
        name: 'Reference Credit',
        kind: 'consumable',
        description: 'Open a tutor reference during a live block.',
        maxLevel: 1,
        chargeCost: 6,
        upgradeBase: 0,
        effectLabel: 'live opens',
        effectAt: () => 1,
    },
    avatar_frame: {
        sku: 'avatar_frame',
        name: 'Gold Frame',
        kind: 'cosmetic',
        description: 'A gold ring around your avatar on pride boards.',
        maxLevel: 1,
        chargeCost: 45,
        upgradeBase: 0,
        effectLabel: 'owned',
        effectAt: () => 1,
    },
    nameplate: {
        sku: 'nameplate',
        name: 'Duo Nameplate',
        kind: 'cosmetic',
        description: 'A bold nameplate behind your display name.',
        maxLevel: 1,
        chargeCost: 35,
        upgradeBase: 0,
        effectLabel: 'owned',
        effectAt: () => 1,
    },
    accent_pack: {
        sku: 'accent_pack',
        name: 'Accent Pack',
        kind: 'cosmetic',
        description: 'Unlock extra profile colors for the pride board.',
        maxLevel: 1,
        chargeCost: 40,
        upgradeBase: 0,
        effectLabel: 'owned',
        effectAt: () => 1,
    },
    pride_pin: {
        sku: 'pride_pin',
        name: 'Pride Pin',
        kind: 'cosmetic',
        description: 'Pin one pride stat on your public profile.',
        maxLevel: 1,
        chargeCost: 55,
        upgradeBase: 0,
        effectLabel: 'owned',
        effectAt: () => 1,
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
        owned: item.kind === 'cosmetic' && (Number(inventoryItem.charges) || 0) > 0,
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
    CERTIFICATE_PRINT_COST,
    BLOCK_RESET_COST,
    REFERENCE_LIVE_COST,
    PREMIUM_ACCENT_COLORS,
    getItem,
    upgradeCost,
    chargeCost,
    countLiveScoredBlocks,
    maxStarsForLesson,
    lessonResetCost,
    publicItem,
};
