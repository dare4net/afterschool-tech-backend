const defaultProgressRepo = require('../repositories/progressRepo');
const defaultInventoryRepo = require('../repositories/inventoryRepo');
const defaultWalletRepo = require('../repositories/walletRepo');
const defaultPrideStats = require('./prideStats');
const { recordProgressEvent: defaultRecordProgress } = require('./studentProgress');
const { nextStreakState, streakMilestoneReward, nextStreakMilestone, utcDay } = require('./loginStreak');

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
        const sameDayBonus = progress.lastLoginDate === today
            ? (Number(progress.lastStreakBonusStars) || 0)
            : 0;
        return {
            ...next,
            streakBonusStars: sameDayBonus,
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
        if (bonus > 0 && typeof walletRepo.applyBalanceChange === 'function') {
            const transaction = walletRepo.earnTransaction(bonus, `login_streak:${next.loginStreak}`, 'login-streak');
            await walletRepo.applyBalanceChange(userId, {
                inc: bonus,
                transaction,
                upsert: true,
            });
            if (typeof recordProgressEvent === 'function') {
                const after = await recordProgressEvent(userId, 'STARS_AWARDED', { amount: bonus });
                if (prideStats && typeof prideStats.syncFromProgressEvent === 'function') {
                    await prideStats.syncFromProgressEvent(userId, 'STARS_AWARDED', { amount: bonus }, after);
                }
            }
        }
    }

    await progressRepo.update(userId, {
        $set: {
            loginStreak: next.loginStreak,
            longestLoginStreak: next.longestLoginStreak,
            lastLoginDate: next.lastLoginDate,
            lastStreakBonusStars: bonus,
            updated_at: new Date(),
        },
    });

    await prideStats.syncFromProgressEvent(userId, 'LOGIN_STREAK', {
        count: next.loginStreak,
    }, { loginStreak: next.loginStreak });

    return {
        ...next,
        streakBonusStars: bonus,
        freezeRemaining: Math.max(0, freezeRemaining - (next.usedFreeze || 0)),
        nextMilestone: nextStreakMilestone(next.loginStreak),
        nextMilestoneReward: streakMilestoneReward(nextStreakMilestone(next.loginStreak)),
    };
}

module.exports = {
    applyLoginStreak,
};
