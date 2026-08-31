const defaultProgressRepo = require('../repositories/progressRepo');
const defaultCurriculumRepo = require('../repositories/curriculumRepo');
const defaultJobsRepo = require('../repositories/jobsRepo');
const { utcDay } = require('./loginStreak');
const { isPushConfigured, dispatchPush: defaultDispatchPush } = require('./pushDispatch');
const {
    pickLessonNudges,
    streakCopy,
    lessonCopy,
    programLabel,
    utcDayStart,
} = require('./reminderAudience');
const { log } = require('./logger');

const FANOUT_CAP = 500;
const SAMPLE_SIZE = 8;

function catalog() {
    return [
        {
            id: 'streak_reminders',
            title: 'Streak reminders',
            description: 'Students with a live streak who have not logged in today (UTC). Duolingo-style “don’t lose it” ping.',
            cadence: 'Once per evening. No Render cron — tap when you want it sent.',
        },
        {
            id: 'lesson_reminders',
            title: 'Unfinished lesson reminders',
            description: 'Students who started a course (1–99%) and have not been active today.',
            cadence: 'Once per evening. No Render cron — tap when you want it sent.',
        },
    ];
}

function createJobs({
    progressRepo = defaultProgressRepo,
    curriculumRepo = defaultCurriculumRepo,
    jobsRepo = defaultJobsRepo,
    dispatchPush = defaultDispatchPush,
} = {}) {
    const running = new Set();
    async function deliver(type, userId, copy, { dryRun, today }) {
        if (dryRun) {
            return { skipped: false, delivered: false, queued: true };
        }
        if (await jobsRepo.wasSent(userId, type, today)) {
            return { skipped: true, delivered: false, queued: false };
        }
        const result = await dispatchPush({
            userId,
            type,
            title: copy.title,
            body: copy.body,
            href: copy.href,
        });
        if (result && result.delivered) {
            await jobsRepo.markSent(userId, type, today);
            return { skipped: false, delivered: true, queued: false };
        }
        return { skipped: false, delivered: false, queued: true };
    }

    async function runStreak({ dryRun, today }) {
        const rows = await progressRepo.listStreakAtRisk(today, FANOUT_CAP);
        const truncated = rows.length >= FANOUT_CAP;
        let skippedAlreadySent = 0;
        let dispatched = 0;
        let queued = 0;
        const sample = [];
        for (const row of rows) {
            const userId = String(row.user_id || '');
            if (!userId) continue;
            const copy = streakCopy(row);
            const result = await deliver('STREAK_REMINDER', userId, copy, { dryRun, today });
            if (result.skipped) skippedAlreadySent += 1;
            else if (result.delivered) dispatched += 1;
            else queued += 1;
            if (sample.length < SAMPLE_SIZE) {
                sample.push({ userId, title: copy.title, body: copy.body, href: copy.href });
            }
        }
        return {
            candidates: rows.length,
            skippedAlreadySent,
            dispatched,
            queued: dryRun ? rows.length : queued,
            truncated,
            sample,
        };
    }

    async function runLesson({ dryRun, today }) {
        const rows = await curriculumRepo.listUnfinishedRegistrations({
            before: utcDayStart(today),
            cap: FANOUT_CAP * 3,
        });
        const picked = pickLessonNudges(rows, today, FANOUT_CAP);
        const programs = await curriculumRepo.findProgramsByIds(
            picked.nudges.map((row) => row.program_id)
        );
        const names = new Map(
            (programs || []).map((program) => [String(program._id), programLabel(program)])
        );
        let skippedAlreadySent = 0;
        let dispatched = 0;
        let queued = 0;
        const sample = [];
        for (const row of picked.nudges) {
            const userId = String(row.user_id || '');
            if (!userId) continue;
            const copy = lessonCopy(row, names.get(String(row.program_id)));
            const result = await deliver('LESSON_REMINDER', userId, copy, { dryRun, today });
            if (result.skipped) skippedAlreadySent += 1;
            else if (result.delivered) dispatched += 1;
            else queued += 1;
            if (sample.length < SAMPLE_SIZE) {
                sample.push({ userId, title: copy.title, body: copy.body, href: copy.href });
            }
        }
        return {
            candidates: picked.candidates,
            skippedAlreadySent,
            dispatched,
            queued: dryRun ? picked.nudges.length : queued,
            truncated: picked.truncated,
            sample,
        };
    }

    async function listJobs() {
        const specs = catalog();
        let last = {};
        try {
            last = await jobsRepo.latestByJobIds(specs.map((job) => job.id));
        } catch (err) {
            log('warn', 'job_list_runs_failed', { msg: err.message });
        }
        return specs.map((job) => ({
            ...job,
            pushConfigured: isPushConfigured(),
            lastRun: last[job.id] || null,
        }));
    }

    async function runJob(id, { dryRun = true, actor = 'superadmin', now = new Date() } = {}) {
        const spec = catalog().find((job) => job.id === id);
        if (!spec) return null;
        if (running.has(id)) return { error: 'busy' };
        running.add(id);
        const startedAt = new Date();
        try {
            const today = utcDay(now);
            const stats = id === 'streak_reminders'
                ? await runStreak({ dryRun: Boolean(dryRun), today })
                : await runLesson({ dryRun: Boolean(dryRun), today });
            const result = {
                jobId: id,
                dryRun: Boolean(dryRun),
                actor,
                ...stats,
                pushConfigured: isPushConfigured(),
                startedAt,
                finishedAt: new Date(),
            };
            try {
                await jobsRepo.insertRun(result);
            } catch (err) {
                log('warn', 'job_run_persist_failed', { msg: err.message, jobId: id });
            }
            return result;
        } catch (err) {
            log('warn', 'job_run_failed', { msg: err.message, jobId: id });
            throw err;
        } finally {
            running.delete(id);
        }
    }

    return {
        listJobs,
        runJob,
    };
}

const defaults = createJobs();

module.exports = {
    FANOUT_CAP,
    catalog,
    createJobs,
    listJobs: defaults.listJobs,
    runJob: defaults.runJob,
};
