const defaultProgressRepo = require('../repositories/progressRepo');
const defaultInventoryRepo = require('../repositories/inventoryRepo');
const defaultWalletRepo = require('../repositories/walletRepo');
const defaultPrideStats = require('./prideStats');
const { recordProgressEvent: defaultRecordProgress } = require('./studentProgress');
const { nextStreakState, streakMilestoneReward, nextStreakMilestone, utcDay } = require('./loginStreak');
const { getPendingStreakBonus, streakBonusPayload } = require('./claimStreakBonus');

async function applyLoginStreak(userId, {
    progressRepo = defaultProgressRepo,
    inventoryRepo = defaultInventoryRepo,
    walletRepo = defaultWalletRepo,
    prideStats = defaultPrideStats,
    recordProgressEvent = defaultRecordProgress,
    now,
} = {}) {
    const progress = await progressRepo.getOrCreate(userId);
    const inventory = await inventoryRepo.getOrCreate(userId);
    const freezeRemaining = Number(inventory.buffs?.streak_freeze?.remaining) || 0;
    const today = now ? utcDay(now) : utcDay();
    const next = nextStreakState(progress, today, freezeRemaining);

    if (next.alreadyCounted) {
        const bonusPayload = streakBonusPayload(progress);
        return {
            ...next,
            ...bonusPayload,
            freezeRemaining,
            nextMilestone: nextStreakMilestone(next.loginStreak),
            nextMilestoneReward: streakMilestoneReward(nextStreakMilestone(next.loginStreak)),
        };
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

    let bonus = 0;
    if (next.continued) {
        bonus = streakMilestoneReward(next.loginStreak);
    }

    const existingPending = getPendingStreakBonus(progress);
    const progressUpdate = {
        loginStreak: next.loginStreak,
        longestLoginStreak: next.longestLoginStreak,
        lastLoginDate: next.lastLoginDate,
        lastStreakBonusStars: bonus,
        updated_at: new Date(),
    };
    if (bonus > 0) {
        progressUpdate.pendingStreakBonusStars = bonus + existingPending;
        progressUpdate.pendingStreakBonusMilestone = next.loginStreak;
        progressUpdate.streakBonusClaimed = false;
    }

    await progressRepo.update(userId, {
        $set: progressUpdate,
    });

    await prideStats.syncFromProgressEvent(userId, 'LOGIN_STREAK', {
        count: next.loginStreak,
    }, { loginStreak: next.loginStreak });

    const bonusPayload = streakBonusPayload({
        ...progress,
        ...progressUpdate,
    });

    return {
        ...next,
        ...bonusPayload,
        freezeRemaining: Math.max(0, freezeRemaining - (next.usedFreeze || 0)),
        nextMilestone: nextStreakMilestone(next.loginStreak),
        nextMilestoneReward: streakMilestoneReward(nextStreakMilestone(next.loginStreak)),
    };
}

module.exports = {
    applyLoginStreak,
};
