const { getMissionById, missionsForLevel, isMissionEarned, sanitizeTypeKey, sanitizeProgressKey, componentProgressKey } = require('./platformMissions');
const defaultProgressRepo = require('../repositories/progressRepo');
const defaultWalletRepo = require('../repositories/walletRepo');
const defaultStatsRepo = require('../repositories/statsRepo');

const seedCatalog = {
    getMission: async (id) => getMissionById(id),
    missionsForLevel: async (level) => missionsForLevel(level),
};

function createStudentProgress({
    progressRepo = defaultProgressRepo,
    walletRepo = defaultWalletRepo,
    statsRepo = defaultStatsRepo,
    catalog = seedCatalog,
} = {}) {
    async function getOrCreateProgress(userId) {
        return progressRepo.getOrCreate(userId);
    }

    async function gatherMissionStats(userId, progress, starBalance) {
        const recordedLifetime = Number(progress.lifetimeStarsEarned) || 0;
        const lifetimeFloor = Math.max(
            recordedLifetime,
            (Number(starBalance) || 0) + (Number(progress.starsSpent) || 0),
        );
        if (lifetimeFloor > recordedLifetime) {
            progress = await progressRepo.update(userId, {
                $set: { lifetimeStarsEarned: lifetimeFloor, updated_at: new Date() },
            }) || { ...progress, lifetimeStarsEarned: lifetimeFloor };
        }
        const regCount = await statsRepo.countProgramRegistrations(userId);
        const userProgramsCount = await statsRepo.countUserPrograms(userId);
        const completions = typeof statsRepo.listCompletions === 'function'
            ? await statsRepo.listCompletions(userId)
            : [];
        return {
            programsEnrolled: Math.max(regCount, userProgramsCount),
            starsEarned: starBalance || 0,
            lifetimeStarsEarned: Number(progress.lifetimeStarsEarned) || lifetimeFloor,
            componentsReset: progress.componentsReset || 0,
            starsSpent: progress.starsSpent || 0,
            consecutiveCorrect: progress.consecutiveCorrect || 0,
            lessonsReviewed: progress.lessonsReviewed || 0,
            lessonsCompleted: Math.max(progress.lessonsCompleted || 0, completions.length),
            totalSubmits: progress.totalSubmits || 0,
            liveSubmits: progress.liveSubmits || 0,
            practiceSubmits: progress.practiceSubmits || 0,
            perfectSubmits: progress.perfectSubmits || 0,
            perfectLiveSubmits: progress.perfectLiveSubmits || 0,
            perfectPracticeSubmits: progress.perfectPracticeSubmits || 0,
            submitsByType: progress.submitsByType || {},
            submitsByLesson: progress.submitsByLesson || {},
            submitsByComponent: progress.submitsByComponent || {},
        };
    }

    async function creditWallet(userId, amount, reason) {
        const transaction = walletRepo.earnTransaction(amount, reason);
        const updated = await walletRepo.applyBalanceChange(userId, {
            inc: amount,
            transaction,
            upsert: true,
        });
        if (amount > 0) {
            await recordProgressEvent(userId, 'STARS_AWARDED', { amount });
        }
        return updated ? (updated.starBalance || amount) : amount;
    }

    async function claimMission(userId, missionId) {
        const mission = await catalog.getMission(missionId);
        if (!mission || mission.enabled === false) {
            return { error: 'Unknown mission', status: 400 };
        }

        const progress = await getOrCreateProgress(userId);
        if (mission.level !== (progress.level || 1)) {
            return { error: 'Mission is not on the current level', status: 400 };
        }
        if ((progress.completedMissions || []).includes(missionId)) {
            const wallet = await walletRepo.findByUserId(userId);
            return {
                alreadyClaimed: true,
                level: progress.level || 1,
                completedMissions: progress.completedMissions || [],
                starBalance: wallet ? (wallet.starBalance || 0) : 0,
            };
        }

        const wallet = await walletRepo.findByUserId(userId);
        const starBalance = wallet ? (wallet.starBalance || 0) : 0;
        const stats = await gatherMissionStats(userId, progress, starBalance);
        if (!isMissionEarned(mission, stats)) {
            return { error: 'Mission is not complete', status: 400 };
        }

        const newBalance = await creditWallet(userId, mission.rewardStars, `Mission claim: ${mission.id}`);
        const next = await progressRepo.update(userId, {
            $addToSet: { completedMissions: missionId },
            $set: { updated_at: new Date() },
        });
        return {
            level: next.level || 1,
            completedMissions: next.completedMissions || [],
            starBalance: newBalance,
            missionId,
            title: mission.title,
            rewardStars: mission.rewardStars,
        };
    }

    async function levelUp(userId) {
        const progress = await getOrCreateProgress(userId);
        const currentLevel = progress.level || 1;
        const needed = await catalog.missionsForLevel(currentLevel);
        const claimed = new Set(progress.completedMissions || []);
        if (!needed.length || !needed.every((m) => claimed.has(m.id))) {
            return { error: 'Claim all missions before leveling up', status: 400 };
        }

        const next = await progressRepo.update(userId, {
            $inc: { level: 1 },
            $set: { updated_at: new Date() },
        });
        return { level: next.level || currentLevel + 1, completedMissions: next.completedMissions || [] };
    }

    async function recordProgressEvent(userId, eventType, payload = {}) {
        await getOrCreateProgress(userId);
        const update = { $set: { updated_at: new Date() } };
        const amount = Number(payload.amount) || 0;

        if (eventType === 'COMPONENT_RESET') {
            update.$inc = { componentsReset: 1 };
        } else if (eventType === 'LESSON_REVIEWED') {
            update.$inc = { lessonsReviewed: 1 };
        } else if (eventType === 'LESSON_COMPLETED') {
            update.$inc = { lessonsCompleted: 1 };
        } else if (eventType === 'PROGRAM_ENROLLED') {
            // Enrollment count is derived from registrations; persist only for timestamp.
        } else if (eventType === 'STARS_AWARDED') {
            if (amount > 0) update.$inc = { lifetimeStarsEarned: amount };
        } else if (eventType === 'STARS_SPENT') {
            if (amount > 0) update.$inc = { starsSpent: amount };
        } else if (eventType === 'COMPONENT_SUBMITTED') {
            const typeKey = sanitizeTypeKey(payload.type);
            const mode = payload.mode === 'live' || payload.mode === 'practice' ? payload.mode : '';
            const perfect = Boolean(payload.isFirstAttempt) && Number(payload.percentage) >= 100;
            const lessonKey = sanitizeProgressKey(payload.lessonId);
            const componentKey = componentProgressKey(payload.lessonId, payload.componentId);
            const inc = { totalSubmits: 1 };
            const bumpBag = (prefix, nestType) => {
                inc[`${prefix}.total`] = 1;
                if (mode) inc[`${prefix}.${mode}`] = 1;
                if (perfect) {
                    inc[`${prefix}.perfect`] = 1;
                    if (mode === 'live') inc[`${prefix}.perfectLive`] = 1;
                    if (mode === 'practice') inc[`${prefix}.perfectPractice`] = 1;
                }
                if (nestType && typeKey) bumpBag(`${prefix}.byType.${typeKey}`, false);
            };
            if (mode) inc[`${mode}Submits`] = 1;
            if (typeKey) bumpBag(`submitsByType.${typeKey}`, false);
            if (lessonKey) bumpBag(`submitsByLesson.${lessonKey}`, true);
            if (componentKey) bumpBag(`submitsByComponent.${componentKey}`, false);
            if (perfect) {
                inc.perfectSubmits = 1;
                if (mode === 'live') inc.perfectLiveSubmits = 1;
                if (mode === 'practice') inc.perfectPracticeSubmits = 1;
                inc.consecutiveCorrect = 1;
            } else {
                update.$set.consecutiveCorrect = 0;
            }
            update.$inc = inc;
        } else {
            return { error: 'Unknown event type', status: 400 };
        }

        const next = await progressRepo.update(userId, update);
        return {
            componentsReset: next.componentsReset || 0,
            consecutiveCorrect: next.consecutiveCorrect || 0,
            lessonsReviewed: next.lessonsReviewed || 0,
            lessonsCompleted: next.lessonsCompleted || 0,
            starsSpent: next.starsSpent || 0,
            lifetimeStarsEarned: next.lifetimeStarsEarned || 0,
            totalSubmits: next.totalSubmits || 0,
            liveSubmits: next.liveSubmits || 0,
            practiceSubmits: next.practiceSubmits || 0,
            perfectSubmits: next.perfectSubmits || 0,
            submitsByType: next.submitsByType || {},
            submitsByLesson: next.submitsByLesson || {},
            submitsByComponent: next.submitsByComponent || {},
        };
    }

    return {
        getOrCreateProgress,
        gatherMissionStats,
        claimMission,
        levelUp,
        recordProgressEvent,
    };
}

const defaults = createStudentProgress();

module.exports = {
    COLLECTION: defaultProgressRepo.COLLECTION,
    createStudentProgress,
    ...defaults,
};
