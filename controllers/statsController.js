const { getAuthenticatedUserId } = require('../helpers/actorUser');
const { getOrCreateProgress, gatherMissionStats, recordProgressEvent } = require('../helpers/studentProgress');
const walletRepo = require('../repositories/walletRepo');
const statsRepo = require('../repositories/statsRepo');
const prideStats = require('../helpers/prideStats');
const { applyLoginStreak } = require('../helpers/applyLoginStreak');

/**
 * Get unified stats summary for a student's dashboard
 */
exports.getStudentStats = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const streak = await applyLoginStreak(userId);
        const wallet = await walletRepo.findByUserId(userId);
        const starBalance = wallet ? (wallet.starBalance || 0) : 0;
        const progress = await getOrCreateProgress(userId);
        const missionStats = await gatherMissionStats(userId, progress, starBalance);

        const completions = await statsRepo.listCompletions(userId);
        const totalScore = completions.reduce((sum, c) => sum + (c.score || 0), 0);

        const achievementsCount = await statsRepo.countAchievements(userId);
        const programsEnrolled = missionStats.programsEnrolled;
        const higherCount = await statsRepo.countHigherScorers(totalScore);
        const globalRank = higherCount + 1;

        res.json({
            success: true,
            userId,
            stats: {
                starBalance,
                totalScore,
                totalBaselineScore: totalScore,
                lessonsCompleted: missionStats.lessonsCompleted,
                completedLessonsCount: missionStats.lessonsCompleted,
                achievementsEarned: achievementsCount,
                programsEnrolled,
                enrolledProgramsCount: programsEnrolled,
                globalRank,
                level: progress.level || 1,
                completedMissions: progress.completedMissions || [],
                componentsReset: missionStats.componentsReset,
                consecutiveCorrect: missionStats.consecutiveCorrect,
                lessonsReviewed: missionStats.lessonsReviewed,
                starsSpent: missionStats.starsSpent,
                lifetimeStarsEarned: missionStats.lifetimeStarsEarned,
                totalSubmits: missionStats.totalSubmits,
                liveSubmits: missionStats.liveSubmits,
                practiceSubmits: missionStats.practiceSubmits,
                perfectSubmits: missionStats.perfectSubmits,
                perfectLiveSubmits: missionStats.perfectLiveSubmits,
                perfectPracticeSubmits: missionStats.perfectPracticeSubmits,
                submitsByType: missionStats.submitsByType,
                submitsByLesson: missionStats.submitsByLesson,
                submitsByComponent: missionStats.submitsByComponent,
                loginStreak: streak.loginStreak,
                longestLoginStreak: streak.longestLoginStreak,
                lastLoginDate: streak.lastLoginDate,
                streakContinued: streak.continued,
                streakBroken: streak.broken,
                streakAlreadyCounted: streak.alreadyCounted,
                streakUsedFreeze: streak.usedFreeze,
                streakBonusStars: streak.streakBonusStars || 0,
                streakFreezeRemaining: streak.freezeRemaining || 0,
                nextStreakMilestone: streak.nextMilestone || null,
                nextStreakMilestoneReward: streak.nextMilestoneReward || 0,
            }
        });
    } catch (err) {
        console.error('[STATS] Error fetching student stats:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.recordProgressEvent = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { eventType, isFirstAttempt, percentage, mode, type, amount, lessonId, programId, componentId, completionTimeMs } = req.validatedBody;

        const result = await recordProgressEvent(userId, eventType, {
            isFirstAttempt: Boolean(isFirstAttempt),
            percentage: typeof percentage === 'number' ? percentage : 0,
            mode,
            type,
            amount,
            lessonId,
            programId,
            componentId,
            completionTimeMs,
        });
        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }
        const prideResult = await prideStats.syncFromProgressEvent(userId, eventType, {
            isFirstAttempt: Boolean(isFirstAttempt),
            percentage: typeof percentage === 'number' ? percentage : 0,
            mode,
            type,
            amount,
            lessonId,
            programId,
            componentId,
            completionTimeMs,
        }, result);
        res.json({ success: true, ...result, golds: prideResult?.golds || [] });
    } catch (err) {
        console.error('[STATS] Error recording progress event:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
