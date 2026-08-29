const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { matchesRules } = require('../helpers/catalogRules');
const { achievementMatches, PLATFORM_ACHIEVEMENTS } = require('../helpers/platformAchievements');
const { countForMission, getMissionById, PLATFORM_MISSIONS } = require('../helpers/platformMissions');
const { createMissionSchema, createAchievementSchema } = require('../validators/studioValidators');

describe('C9 expandable catalog', () => {
    it('evaluates missions from stat keys instead of per-id branches', () => {
        const mission = getMissionById('l1-reset-component');
        assert.equal(mission.stat, 'componentsReset');
        assert.equal(countForMission(mission, { componentsReset: 0 }), 0);
        assert.equal(countForMission(mission, { componentsReset: 2 }), 2);
        assert.equal(PLATFORM_MISSIONS.every((m) => typeof m.stat === 'string'), true);

        const liveQuizzes = {
            id: 'l3-perfect-live-quizzes',
            stat: 'submits',
            targetCount: 3,
            filters: { mode: 'live', type: 'quiz', perfect: true },
        };
        assert.equal(countForMission(liveQuizzes, {
            submitsByType: { quiz: { perfectLive: 2 } },
        }), 2);
        assert.equal(countForMission(liveQuizzes, {
            submitsByType: { quiz: { perfectLive: 3 } },
        }), 3);

        const thisHangman = {
            id: 'l3-this-hangman',
            stat: 'submits',
            targetCount: 1,
            filters: { lessonId: 'lesson-1', componentId: 'hang-1', type: 'hangman' },
        };
        assert.equal(countForMission(thisHangman, {
            submitsByComponent: { 'lesson-1__hang-1': { total: 1 } },
        }), 1);
        assert.equal(countForMission(thisHangman, {
            submitsByType: { hangman: { total: 4 } },
        }), 0);
    });

    it('evaluates achievements from JSON rules, not JS functions', () => {
        const source = readFileSync(join(__dirname, '../helpers/platformAchievements.js'), 'utf8');
        assert.equal(source.includes('condition:'), false);

        const grid = PLATFORM_ACHIEVEMENTS.find((a) => a.id === 'grid-memory-master');
        assert.equal(achievementMatches(grid, 'COMPONENT_SUBMITTED', {
            type: 'memoryGrid',
            attemptCount: 4,
            isFirstAttempt: true,
        }), true);
        assert.equal(achievementMatches(grid, 'COMPONENT_SUBMITTED', {
            type: 'quiz',
            attemptCount: 1,
            isFirstAttempt: true,
        }), false);

        const speed = PLATFORM_ACHIEVEMENTS.find((a) => a.id === 'speed-demon');
        assert.equal(achievementMatches(speed, 'LIVE_EARLY_FINISH', {
            completionTimeMs: 20,
            timeLimitMs: 100,
        }), true);
        assert.equal(achievementMatches(speed, 'LIVE_EARLY_FINISH', {
            completionTimeMs: 80,
            timeLimitMs: 100,
        }), false);

        assert.equal(matchesRules({ percentage: 100 }, [{ field: 'percentage', op: 'eq', value: 100 }]), true);
    });

    it('accepts catalog payloads for new missions and achievements', () => {
        const mission = createMissionSchema.parse({
            id: 'l3-review-two',
            level: 3,
            title: 'Double Scholar',
            description: 'Review 2 lessons',
            targetCount: 2,
            rewardStars: 6,
            stat: 'lessonsReviewed',
        });
        assert.equal(mission.level, 3);

        const achievement = createAchievementSchema.parse({
            id: 'quiz-ace',
            title: 'Quiz Ace',
            description: 'Score 100 on a quiz',
            rewardStars: 4,
            eventType: 'COMPONENT_SUBMITTED',
            rules: [
                { field: 'type', op: 'eq', value: 'quiz' },
                { field: 'percentage', op: 'eq', value: 100 },
            ],
        });
        assert.equal(achievement.icon, 'award');
        assert.equal(createMissionSchema.safeParse({ id: 'Bad ID' }).success, false);

        const filtered = createMissionSchema.parse({
            id: 'l3-perfect-live-quizzes',
            level: 3,
            title: 'Quiz Ace',
            description: 'Score 100 on 3 live quizzes',
            targetCount: 3,
            rewardStars: 8,
            stat: 'submits',
            filters: { mode: 'live', type: 'quiz', perfect: true },
        });
        assert.equal(filtered.filters.perfect, true);
        assert.equal(createMissionSchema.parse({
            id: 'l3-this-hangman',
            level: 3,
            title: 'This Hangman',
            description: 'Complete the hangman in lesson 1',
            targetCount: 1,
            rewardStars: 4,
            stat: 'submits',
            filters: { lessonId: 'lesson-1', componentId: 'hang-1', type: 'hangman' },
        }).filters.componentId, 'hang-1');
        assert.equal(createMissionSchema.parse({
            id: 'l3-finish-two',
            level: 3,
            title: 'Finisher',
            description: 'Complete 2 lessons',
            targetCount: 2,
            rewardStars: 6,
            stat: 'lessonsCompleted',
        }).stat, 'lessonsCompleted');

        const autoIdMission = createMissionSchema.parse({
            level: 3,
            title: 'Double Scholar',
            description: 'Review 2 lessons',
            targetCount: 2,
            rewardStars: 6,
            stat: 'lessonsReviewed',
        });
        assert.equal(autoIdMission.id, undefined);
        assert.equal(createAchievementSchema.parse({
            title: 'Quiz Ace',
            description: 'Score 100 on a quiz',
            rewardStars: 4,
            eventType: 'COMPONENT_SUBMITTED',
            rules: [{ field: 'type', op: 'eq', value: 'quiz' }],
        }).id, undefined);
    });

    it('allocates unique catalog ids from title so Superadmin does not invent slugs', () => {
        const { allocateCatalogId } = require('../helpers/catalogIds');
        assert.equal(allocateCatalogId({
            kind: 'mission',
            title: 'Double Scholar',
            level: 3,
            existingIds: [],
        }), 'l3-double-scholar');
        assert.equal(allocateCatalogId({
            kind: 'mission',
            title: 'Double Scholar',
            level: 3,
            existingIds: ['l3-double-scholar'],
        }), 'l3-double-scholar-2');
        assert.equal(allocateCatalogId({
            kind: 'achievement',
            title: 'Quiz Ace',
            existingIds: ['quiz-ace'],
        }), 'quiz-ace-2');
    });

    it('exposes student catalog GET and superadmin CRUD', () => {
        const missions = readFileSync(join(__dirname, '../routes/missionRoutes.js'), 'utf8');
        const studio = readFileSync(join(__dirname, '../routes/studioRoutes.js'), 'utf8');
        const superadmin = readFileSync(join(__dirname, '../routes/superadminRoutes.js'), 'utf8');
        const server = readFileSync(join(__dirname, '../server.js'), 'utf8');
        assert.match(missions, /router\.get\('\/catalog'/);
        assert.equal(studio.includes('/catalog/missions'), false);
        assert.match(superadmin, /\/catalog\/missions/);
        assert.match(superadmin, /\/catalog\/achievements/);
        assert.match(superadmin, /\/catalog\/targets/);
        assert.match(server, /app\.use\('\/api\/superadmin'/);
    });
});
