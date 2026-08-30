const defaultProgressRepo = require('../repositories/progressRepo');
const defaultInventoryRepo = require('../repositories/inventoryRepo');
const defaultPrideStats = require('./prideStats');
const { nextStreakState } = require('./loginStreak');

async function applyLoginStreak(userId, {
    progressRepo = defaultProgressRepo,
    inventoryRepo = defaultInventoryRepo,
    prideStats = defaultPrideStats,
} = {}) {
    const progress = await progressRepo.getOrCreate(userId);
    const inventory = await inventoryRepo.getOrCreate(userId);
    const freezeRemaining = Number(inventory.buffs?.streak_freeze?.remaining) || 0;
    const next = nextStreakState(progress, undefined, freezeRemaining);

    if (next.alreadyCounted) {
        return next;
    }

    if (next.usedFreeze > 0) {
        const leftover = Math.max(0, freezeRemaining - next.usedFreeze);
        await inventoryRepo.update(userId, {
            $set: {
                'buffs.streak_freeze.remaining': leftover,
                updated_at: new Date(),
            },
        });
    }

    await progressRepo.update(userId, {
        $set: {
            loginStreak: next.loginStreak,
            longestLoginStreak: next.longestLoginStreak,
            lastLoginDate: next.lastLoginDate,
            updated_at: new Date(),
        },
    });

    await prideStats.syncFromProgressEvent(userId, 'LOGIN_STREAK', {
        count: next.loginStreak,
    }, { loginStreak: next.loginStreak });

    return next;
}

module.exports = {
    applyLoginStreak,
};
