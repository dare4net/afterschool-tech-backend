const defaultUsersRepo = require('../repositories/usersRepo');
const defaultWalletRepo = require('../repositories/walletRepo');
const { sanitizeHandle, handleError, isAccentColor, isAvatarId } = require('./publicProfile');

const ONBOARDING_BONUS = 5;

function hasExperiencedOnboarding(user) {
    return Boolean(user && (user.onboardingCompletedAt || user.onboardingSkippedAt));
}

function identityFrom(user) {
    return {
        full_name: user.full_name || null,
        handle: user.handle || null,
        accentColor: user.accentColor || null,
        avatarId: user.avatarId || null,
        onboardingCompletedAt: user.onboardingCompletedAt || null,
        onboardingSkippedAt: user.onboardingSkippedAt || null,
        onboardingBonusAwarded: user.onboardingBonusAwarded === true,
    };
}

function createOnboarding({
    usersRepo = defaultUsersRepo,
    walletRepo = defaultWalletRepo,
} = {}) {
    async function complete(userId, body = {}) {
        const user = await usersRepo.findByUserId(userId);
        if (!user) return { status: 404, error: 'User not found' };
        const role = user.account_type || user.role;
        if (role && role !== 'student') return { status: 403, error: 'Students only' };

        const already = hasExperiencedOnboarding(user);
        const skipped = body.skipped === true;
        const now = new Date();
        const patch = {};

        if (body.full_name !== undefined) patch.full_name = body.full_name;
        if (body.handle !== undefined) {
            const nextHandle = sanitizeHandle(body.handle);
            const error = handleError(nextHandle);
            if (error) return { status: 400, error };
            if (await usersRepo.handleTakenByOther(nextHandle, userId)) {
                return { status: 409, error: 'That handle is taken' };
            }
            patch.handle = nextHandle;
        }
        if (body.accentColor !== undefined) {
            if (!isAccentColor(body.accentColor)) return { status: 400, error: 'Pick a handle color' };
            patch.accentColor = body.accentColor;
        }
        if (body.avatarId !== undefined) {
            if (!isAvatarId(body.avatarId)) return { status: 400, error: 'Pick an avatar' };
            patch.avatarId = body.avatarId;
        }

        let bonusAwarded = 0;
        if (!already) {
            if (skipped) patch.onboardingSkippedAt = now;
            else patch.onboardingCompletedAt = now;
            if (!skipped && user.onboardingBonusAwarded !== true) {
                patch.onboardingBonusAwarded = true;
                bonusAwarded = ONBOARDING_BONUS;
            }
        }

        if (Object.keys(patch).length) {
            await usersRepo.updateIdentity(userId, patch);
        }

        let starBalance = null;
        if (bonusAwarded > 0 && typeof walletRepo.applyBalanceChange === 'function') {
            const transaction = walletRepo.earnTransaction(bonusAwarded, 'onboarding', 'onboarding-first-win');
            const wallet = await walletRepo.applyBalanceChange(userId, {
                inc: bonusAwarded,
                transaction,
                upsert: true,
            });
            starBalance = wallet ? wallet.starBalance : bonusAwarded;
        }

        const updated = await usersRepo.findByUserId(userId);
        return {
            status: 200,
            ...identityFrom(updated || { ...user, ...patch }),
            bonusAwarded,
            starBalance,
            alreadyExperienced: already,
        };
    }

    return { complete, hasExperiencedOnboarding, ONBOARDING_BONUS };
}

const defaults = createOnboarding();

module.exports = {
    ONBOARDING_BONUS,
    hasExperiencedOnboarding,
    createOnboarding,
    complete: defaults.complete,
};
