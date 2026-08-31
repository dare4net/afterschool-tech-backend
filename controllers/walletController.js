const { getAuthenticatedUserId } = require('../helpers/actorUser');
const walletRepo = require('../repositories/walletRepo');
const { recordProgressEvent } = require('../helpers/studentProgress');
const prideStats = require('../helpers/prideStats');
const starStore = require('../helpers/starStore');

/**
 * Get current star wallet balance and transaction history for a user
 */
exports.getWallet = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const wallet = await walletRepo.getOrCreate(userId);

        res.json({
            success: true,
            starBalance: wallet.starBalance || 0,
            transactions: (wallet.transactions || []).slice(-20).reverse()
        });
    } catch (err) {
        console.error('[WALLET] Error getting wallet:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Award stars to a user's wallet
 */
exports.awardStars = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const { amount, reason = 'Live Component Completion', componentId } = req.validatedBody;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (componentId && typeof walletRepo.hasAwardedComponent === 'function') {
            const already = await walletRepo.hasAwardedComponent(userId, componentId);
            if (already) {
                const wallet = await walletRepo.getOrCreate(userId);
                return res.json({
                    success: true,
                    starBalance: wallet.starBalance || 0,
                    alreadyAwarded: true,
                });
            }
        }

        let awarded = amount;
        const reasonText = String(reason || '');
        if (/timeout/i.test(reasonText)) {
            const shield = await starStore.consumeBuff(userId, 'focus_shield');
            if (shield.consumed) awarded += 1;
        }
        const surge = await starStore.consumeBuff(userId, 'star_surge');
        if (surge.consumed) awarded += Number(surge.effect) || 0;

        const transaction = walletRepo.earnTransaction(awarded, reason, componentId);
        const updatedWallet = await walletRepo.applyBalanceChange(userId, {
            inc: awarded,
            transaction,
            upsert: true,
            awardedComponentId: componentId || undefined,
        });
        const progressAfter = await recordProgressEvent(userId, 'STARS_AWARDED', { amount: awarded });
        await prideStats.syncFromProgressEvent(userId, 'STARS_AWARDED', { amount: awarded }, progressAfter);

        res.json({
            success: true,
            starBalance: updatedWallet ? updatedWallet.starBalance : amount,
            transaction
        });
    } catch (err) {
        console.error('[WALLET] Error awarding stars:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Spend stars from a user's wallet
 */
exports.spendStars = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const { amount, itemType = 'Reward Item' } = req.validatedBody;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const wallet = await walletRepo.findByUserId(userId);
        const currentBalance = wallet ? (wallet.starBalance || 0) : 0;

        if (currentBalance < amount) {
            return res.status(400).json({
                error: 'Insufficient star balance',
                currentBalance,
                required: amount
            });
        }

        const transaction = walletRepo.spendTransaction(amount, itemType);
        const updatedWallet = await walletRepo.applyBalanceChange(userId, {
            inc: -amount,
            transaction,
        });
        await recordProgressEvent(userId, 'STARS_SPENT', { amount });

        res.json({
            success: true,
            starBalance: updatedWallet ? updatedWallet.starBalance : (currentBalance - amount),
            transaction
        });
    } catch (err) {
        console.error('[WALLET] Error spending stars:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
