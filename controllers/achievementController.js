const { getAuthenticatedUserId } = require('../helpers/actorUser');
const { catalogPublicFields, achievementMatches } = require('../helpers/platformAchievements');
const platformCatalog = require('../helpers/platformCatalog');
const achievementRepo = require('../repositories/achievementRepo');
const walletRepo = require('../repositories/walletRepo');
const { recordProgressEvent } = require('../helpers/studentProgress');

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

        for (const ach of matching) {
            if (!achievementMatches(ach, eventType, payload)) continue;

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
                await recordProgressEvent(userId, 'STARS_AWARDED', { amount: ach.rewardStars });
            }
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
