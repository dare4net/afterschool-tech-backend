const { getAuthenticatedUserId } = require('../helpers/actorUser');
const { catalogPublicFields, achievementMatches } = require('../helpers/platformAchievements');
const platformCatalog = require('../helpers/platformCatalog');
const achievementRepo = require('../repositories/achievementRepo');
const walletRepo = require('../repositories/walletRepo');
const { recordProgressEvent } = require('../helpers/studentProgress');
const { notify } = require('../helpers/notify');
const prideStats = require('../helpers/prideStats');

exports.getStudentAchievements = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const earned = await achievementRepo.listByUser(userId);
        const earnedIds = new Set(earned.map((e) => e.achievement_id));
        const catalog = await platformCatalog.listAchievements({ includeDisabled: false });

        const catalogWithEarned = catalog.map((ach) => ({
            ...catalogPublicFields(ach),
            isEarned: earnedIds.has(ach.id),
            earnedAt: earned.find((e) => e.achievement_id === ach.id)?.earned_at || null,
        }));

        res.json({
            success: true,
            achievements: catalogWithEarned,
        });
    } catch (err) {
        console.error('[ACHIEVEMENTS] Error fetching student achievements:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.evaluateEvent = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const { eventType, payload } = req.body || {};

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!eventType || typeof eventType !== 'string' || !payload || typeof payload !== 'object') {
            return res.status(400).json({ error: 'eventType and payload are required' });
        }

        const catalog = await platformCatalog.listAchievements({ includeDisabled: false });
        const matching = catalog.filter((a) => a.eventType === eventType);
        const newlyEarned = [];
        let progressAfter = {};

        for (const ach of matching) {
            const extras = payload.extras && typeof payload.extras === 'object' ? payload.extras : {};
            const flat = { ...payload, ...extras };
            if (!achievementMatches(ach, eventType, flat)) continue;

            const existing = await achievementRepo.findEarned(userId, ach.id);
            if (existing) continue;

            const record = {
                user_id: userId,
                achievement_id: ach.id,
                title: ach.title,
                rewardStars: ach.rewardStars,
                earned_at: new Date(),
            };
            await achievementRepo.insertEarned(record);
            newlyEarned.push(record);

            if (ach.rewardStars > 0) {
                const transaction = walletRepo.earnTransaction(
                    ach.rewardStars,
                    `Achievement: ${ach.title}`
                );
                await walletRepo.applyBalanceChange(userId, {
                    inc: ach.rewardStars,
                    transaction,
                    upsert: true,
                });
                progressAfter = await recordProgressEvent(userId, 'STARS_AWARDED', { amount: ach.rewardStars });
            }

            await notify({
                userId,
                type: 'ACHIEVEMENT_EARNED',
                title: ach.title || 'Achievement unlocked',
                body: ach.rewardStars ? `+${ach.rewardStars} Stars` : 'Badge earned',
                href: '/dashboard/student/progress',
                payload: { achievementId: ach.id },
            });
        }

        if (newlyEarned.length) {
            await prideStats.syncFromProgressEvent(userId, 'ACHIEVEMENT_EARNED', {
                count: newlyEarned.length,
            }, progressAfter);
        }

        res.json({
            success: true,
            newlyEarned,
        });
    } catch (err) {
        console.error('[ACHIEVEMENTS] Error evaluating achievements:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
