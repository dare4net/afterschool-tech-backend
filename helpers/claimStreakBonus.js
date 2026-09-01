const defaultProgressRepo = require('../repositories/progressRepo');
const defaultWalletRepo = require('../repositories/walletRepo');
const defaultPrideStats = require('./prideStats');
const { recordProgressEvent: defaultRecordProgress } = require('./studentProgress');

/** Pre-claim-flow users already received stars on login; do not offer claim again. */
function isLegacyAutoCredited(progress) {
    return progress.streakBonusClaimed === undefined
        && (Number(progress.lastStreakBonusStars) || 0) > 0;
}

function getPendingStreakBonus(progress) {
    if (!progress || isLegacyAutoCredited(progress)) return 0;
    if (progress.streakBonusClaimed === true) return 0;
    return Number(progress.pendingStreakBonusStars)
        || Number(progress.lastStreakBonusStars)
        || 0;
}

function streakBonusPayload(progress) {
    const pending = getPendingStreakBonus(progress);
    return {
        streakBonusStars: pending,
        streakBonusClaimed: pending <= 0,
        pendingStreakBonusMilestone: pending > 0
            ? (Number(progress.pendingStreakBonusMilestone) || Number(progress.loginStreak) || null)
            : null,
    };
}

async function claimStreakBonus(userId, {
    progressRepo = defaultProgressRepo,
    walletRepo = defaultWalletRepo,
    prideStats = defaultPrideStats,
    recordProgressEvent = defaultRecordProgress,
} = {}) {
    const progress = await progressRepo.getOrCreate(userId);
    const bonus = getPendingStreakBonus(progress);
    if (bonus <= 0) {
        return { error: 'No streak bonus to claim', status: 400 };
    }

    const milestone = Number(progress.pendingStreakBonusMilestone)
        || Number(progress.loginStreak)
        || 0;

    if (typeof walletRepo.applyBalanceChange === 'function') {
        const transaction = walletRepo.earnTransaction(
            bonus,
            `login_streak:${milestone}`,
            'login-streak'
        );
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

    await progressRepo.update(userId, {
        $set: {
            streakBonusClaimed: true,
            pendingStreakBonusStars: 0,
            updated_at: new Date(),
        },
    });

    const wallet = typeof walletRepo.findByUserId === 'function'
        ? await walletRepo.findByUserId(userId)
        : null;

    return {
        success: true,
        streakBonusStars: bonus,
        starBalance: wallet ? (wallet.starBalance || 0) : undefined,
        streakBonusClaimed: true,
    };
}

module.exports = {
    isLegacyAutoCredited,
    getPendingStreakBonus,
    streakBonusPayload,
    claimStreakBonus,
};
