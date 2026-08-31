const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { previousUtcDay } = require('../helpers/loginStreak');
const {
    isStreakAtRisk,
    needsLessonNudge,
    pickLessonNudges,
    streakCopy,
    lessonCopy,
} = require('../helpers/reminderAudience');
const { catalog, createJobs } = require('../helpers/jobs');
const { isPushConfigured } = require('../helpers/pushDispatch');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

function memoryJobs({
    streakRows = [],
    registrations = [],
    programs = [],
    sent = new Set(),
    delivered = false,
} = {}) {
    const runs = [];
    const pushes = [];
    return {
        runs,
        pushes,
        progressRepo: {
            async listStreakAtRisk() {
                return streakRows;
            },
        },
        curriculumRepo: {
            async listUnfinishedRegistrations() {
                return registrations;
            },
            async findProgramsByIds() {
                return programs;
            },
        },
        jobsRepo: {
            async latestByJobIds(ids) {
                const out = {};
                for (const id of ids) {
                    out[id] = runs.filter((run) => run.jobId === id).at(-1) || null;
                }
                return out;
            },
            async insertRun(run) {
                runs.push(run);
                return run;
            },
            async wasSent(userId, type, day) {
                return sent.has(`${userId}:${type}:${day}`);
            },
            async markSent(userId, type, day) {
                sent.add(`${userId}:${type}:${day}`);
            },
        },
        async dispatchPush(message) {
            pushes.push(message);
            return { delivered, reason: delivered ? 'ok' : 'push_unconfigured' };
        },
    };
}

describe('manual cron jobs', () => {
    it('counts a streak as at risk only on the next UTC day', () => {
        assert.equal(previousUtcDay('2026-08-31'), '2026-08-30');
        assert.equal(isStreakAtRisk({ loginStreak: 4, lastLoginDate: '2026-08-30' }, '2026-08-31'), true);
        assert.equal(isStreakAtRisk({ loginStreak: 4, lastLoginDate: '2026-08-31' }, '2026-08-31'), false);
        assert.equal(isStreakAtRisk({ loginStreak: 4, lastLoginDate: '2026-08-28' }, '2026-08-31'), false);
        assert.equal(isStreakAtRisk({ loginStreak: 0, lastLoginDate: '2026-08-30' }, '2026-08-31'), false);
        assert.equal(streakCopy({ loginStreak: 7 }).href, '/dashboard/student/streak');
        assert.match(streakCopy({ loginStreak: 7 }).title, /7-day/);
    });

    it('nudges one unfinished course per student and skips complete or untouched', () => {
        const todayStart = new Date('2026-08-31T00:00:00.000Z');
        assert.equal(needsLessonNudge({
            status: 'active',
            progress: { percent_complete: 40 },
            last_activity: new Date('2026-08-30T12:00:00.000Z'),
        }, todayStart), true);
        assert.equal(needsLessonNudge({
            status: 'active',
            progress: { percent_complete: 100 },
            last_activity: new Date('2026-08-30T12:00:00.000Z'),
        }, todayStart), false);
        assert.equal(needsLessonNudge({
            status: 'active',
            progress: { percent_complete: 0 },
            last_activity: new Date('2026-08-30T12:00:00.000Z'),
        }, todayStart), false);

        const picked = pickLessonNudges([
            {
                user_id: 'a',
                program_id: 'old',
                progress: { percent_complete: 20 },
                last_activity: new Date('2026-08-28T12:00:00.000Z'),
            },
            {
                user_id: 'a',
                program_id: 'new',
                progress: { percent_complete: 55 },
                last_activity: new Date('2026-08-30T12:00:00.000Z'),
            },
        ], '2026-08-31', 500);
        assert.equal(picked.candidates, 1);
        assert.equal(String(picked.nudges[0].program_id), 'new');
        assert.match(lessonCopy(picked.nudges[0], 'Python').title, /Python/);
    });

    it('preview does not mark sends and run queues until FCM is wired', async () => {
        const deps = memoryJobs({
            streakRows: [{ user_id: 's1', loginStreak: 3, lastLoginDate: '2026-08-30' }],
        });
        const jobs = createJobs(deps);
        const preview = await jobs.runJob('streak_reminders', {
            dryRun: true,
            now: new Date('2026-08-31T18:00:00.000Z'),
        });
        assert.equal(preview.dryRun, true);
        assert.equal(preview.candidates, 1);
        assert.equal(preview.dispatched, 0);
        assert.equal(deps.pushes.length, 0);

        const run = await jobs.runJob('streak_reminders', {
            dryRun: false,
            now: new Date('2026-08-31T18:00:00.000Z'),
        });
        assert.equal(run.dryRun, false);
        assert.equal(run.queued, 1);
        assert.equal(run.dispatched, 0);
        assert.equal(deps.pushes.length, 1);
        assert.equal(deps.pushes[0].type, 'STREAK_REMINDER');
    });

    it('skips a student already reminded today once FCM actually delivers', async () => {
        const deps = memoryJobs({
            streakRows: [{ user_id: 's1', loginStreak: 3, lastLoginDate: '2026-08-30' }],
            delivered: true,
        });
        const jobs = createJobs(deps);
        const first = await jobs.runJob('streak_reminders', {
            dryRun: false,
            now: new Date('2026-08-31T18:00:00.000Z'),
        });
        assert.equal(first.dispatched, 1);
        const second = await jobs.runJob('streak_reminders', {
            dryRun: false,
            now: new Date('2026-08-31T19:00:00.000Z'),
        });
        assert.equal(second.skippedAlreadySent, 1);
        assert.equal(second.dispatched, 0);
        assert.equal(deps.pushes.length, 1);
    });

    it('exposes the two reminder jobs on the superadmin console', () => {
        const ids = catalog().map((job) => job.id);
        assert.deepEqual(ids, ['streak_reminders', 'lesson_reminders']);
        assert.equal(isPushConfigured(), false);

        const routes = read('routes/superadminRoutes.js');
        assert.match(routes, /router\.get\('\/jobs'/);
        assert.match(routes, /router\.post\('\/jobs\/:id\/run'/);
        const controller = read('controllers/superadminController.js');
        assert.equal(controller.includes('getMainDb'), false);
        assert.equal(controller.includes('db.collection'), false);
    });
});
