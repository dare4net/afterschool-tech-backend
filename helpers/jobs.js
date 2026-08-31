const defaultProgressRepo = require('../repositories/progressRepo');
const defaultCurriculumRepo = require('../repositories/curriculumRepo');
const defaultJobsRepo = require('../repositories/jobsRepo');
const defaultUsersRepo = require('../repositories/usersRepo');
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

function recipientStatus(result, dryRun) {
    if (result.skipped) return 'already_sent';
    if (result.noToken) return 'no_token';
    if (result.delivered) return 'sent';
    if (result.sendFailed) return 'send_failed';
    if (dryRun && result.wouldSend) return 'would_send';
    return 'unknown';
}

function createJobs({
    progressRepo = defaultProgressRepo,
    curriculumRepo = defaultCurriculumRepo,
    jobsRepo = defaultJobsRepo,
    usersRepo = defaultUsersRepo,
    dispatchPush = defaultDispatchPush,
} = {}) {
    const running = new Set();

    async function deliver(type, userId, copy, { dryRun, today }) {
        if (await jobsRepo.wasSent(userId, type, today)) {
            return { skipped: true, delivered: false, noToken: false, sendFailed: false };
        }
        const tokens = await usersRepo.listFcmTokens(userId);
        if (!tokens.length) {
            return { skipped: false, delivered: false, noToken: true, sendFailed: false, tokenCount: 0 };
        }
        if (dryRun) {
            return {
                skipped: false,
                delivered: false,
                noToken: false,
                sendFailed: false,
                wouldSend: true,
                tokenCount: tokens.length,
            };
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
            return {
                skipped: false,
                delivered: true,
                noToken: false,
                sendFailed: false,
                tokenCount: tokens.length,
            };
        }
        return {
            skipped: false,
            delivered: false,
            noToken: false,
            sendFailed: true,
            tokenCount: tokens.length,
        };
    }

    function tally(result, stats) {
        if (result.skipped) stats.skippedAlreadySent += 1;
        else if (result.noToken) stats.noToken += 1;
        else if (result.delivered) stats.dispatched += 1;
        else if (result.wouldSend) stats.wouldSend += 1;
        else if (result.sendFailed) stats.sendFailed += 1;
    }

    function emptyStats() {
        return {
            skippedAlreadySent: 0,
            dispatched: 0,
            wouldSend: 0,
            noToken: 0,
            sendFailed: 0,
        };
    }

    async function enrichRecipients(recipients) {
        const userIds = [...new Set(recipients.map((row) => row.userId).filter(Boolean))];
        const users = await usersRepo.findSafeByUserIds(userIds);
        const byId = new Map((users || []).map((user) => [String(user.user_id), user]));
        return recipients.map((row) => {
            const user = byId.get(row.userId);
            return {
                ...row,
                handle: user?.handle || null,
                fullName: user?.full_name || null,
            };
        });
    }

    function streakRecipient(row, copy, result, dryRun) {
        return {
            userId: String(row.user_id || ''),
            status: recipientStatus(result, dryRun),
            tokenCount: result.tokenCount ?? 0,
            title: copy.title,
            body: copy.body,
            href: copy.href,
            loginStreak: Number(row.loginStreak) || 0,
            lastLoginDate: row.lastLoginDate || null,
        };
    }

    function lessonRecipient(row, copy, result, dryRun, programName) {
        const pct = Number(row.progress && row.progress.percent_complete) || 0;
        return {
            userId: String(row.user_id || ''),
            status: recipientStatus(result, dryRun),
            tokenCount: result.tokenCount ?? 0,
            title: copy.title,
            body: copy.body,
            href: copy.href,
            programId: row.program_id ? String(row.program_id) : null,
            programName: programName || null,
            percentComplete: pct,
            lastActivity: row.last_activity || null,
        };
    }

    async function runStreak({ dryRun, today }) {
        const rows = await progressRepo.listStreakAtRisk(today, FANOUT_CAP);
        const truncated = rows.length >= FANOUT_CAP;
        const stats = emptyStats();
        const recipients = [];
        for (const row of rows) {
            const userId = String(row.user_id || '');
            if (!userId) continue;
            const copy = streakCopy(row);
            const result = await deliver('STREAK_REMINDER', userId, copy, { dryRun, today });
            tally(result, stats);
            recipients.push(streakRecipient(row, copy, result, dryRun));
        }
        return {
            candidates: rows.length,
            ...stats,
            truncated,
            recipients: await enrichRecipients(recipients),
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
        const stats = emptyStats();
        const recipients = [];
        for (const row of picked.nudges) {
            const userId = String(row.user_id || '');
            if (!userId) continue;
            const programName = names.get(String(row.program_id));
            const copy = lessonCopy(row, programName);
            const result = await deliver('LESSON_REMINDER', userId, copy, { dryRun, today });
            tally(result, stats);
            recipients.push(lessonRecipient(row, copy, result, dryRun, programName));
        }
        return {
            candidates: picked.candidates,
            ...stats,
            truncated: picked.truncated,
            recipients: await enrichRecipients(recipients),
        };
    }

    async function listJobs() {
        const specs = catalog();
        let last = {};
        let pushRegisteredUsers = 0;
        try {
            last = await jobsRepo.latestRunsByJobIds(specs.map((job) => job.id));
            pushRegisteredUsers = await usersRepo.countWithFcmTokens();
        } catch (err) {
            log('warn', 'job_list_runs_failed', { msg: err.message });
        }
        return specs.map((job) => ({
            ...job,
            pushConfigured: isPushConfigured(),
            pushRegisteredUsers,
            lastPreview: last[job.id]?.lastPreview || null,
            lastSend: last[job.id]?.lastSend || null,
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
        recipientStatus,
    };
}

const defaults = createJobs();

module.exports = {
    FANOUT_CAP,
    catalog,
    createJobs,
    listJobs: defaults.listJobs,
    runJob: defaults.runJob,
    recipientStatus,
};
