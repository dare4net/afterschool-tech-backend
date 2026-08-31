const { getMainDb } = require('../config/database');

const RUNS = 'job_runs';
const SENDS = 'reminder_sends';

async function main() {
    return getMainDb();
}

async function ensureIndexes() {
    const db = await main();
    await db.collection(RUNS).createIndex({ job_id: 1, created_at: -1 });
    await db.collection(RUNS).createIndex({ job_id: 1, dry_run: 1, created_at: -1 });
    await db.collection(SENDS).createIndex(
        { user_id: 1, type: 1, day: 1 },
        { unique: true, name: 'reminder_sends_unique' }
    );
}

function normalizeRecipients(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((row) => ({
        userId: String(row.userId || row.user_id || ''),
        handle: row.handle || null,
        fullName: row.fullName || row.full_name || null,
        status: String(row.status || 'unknown'),
        tokenCount: Number(row.tokenCount) || 0,
        title: String(row.title || ''),
        body: String(row.body || ''),
        href: row.href || null,
        loginStreak: row.loginStreak != null ? Number(row.loginStreak) : undefined,
        lastLoginDate: row.lastLoginDate || null,
        programId: row.programId || null,
        programName: row.programName || null,
        percentComplete: row.percentComplete != null ? Number(row.percentComplete) : undefined,
        lastActivity: row.lastActivity || null,
    })).filter((row) => row.userId);
}

function toPublicRun(doc) {
    if (!doc) return null;
    return {
        id: String(doc._id),
        jobId: doc.job_id,
        dryRun: doc.dry_run === true,
        actor: doc.actor || null,
        candidates: Number(doc.candidates) || 0,
        skippedAlreadySent: Number(doc.skipped_already_sent) || 0,
        dispatched: Number(doc.dispatched) || 0,
        wouldSend: Number(doc.would_send) || 0,
        noToken: Number(doc.no_token) || 0,
        sendFailed: Number(doc.send_failed) || 0,
        queued: Number(doc.queued) || 0,
        truncated: doc.truncated === true,
        pushConfigured: doc.push_configured === true,
        recipients: normalizeRecipients(doc.recipients),
        startedAt: doc.started_at,
        finishedAt: doc.finished_at,
        createdAt: doc.created_at,
    };
}

async function insertRun(run) {
    await ensureIndexes();
    const record = {
        job_id: run.jobId,
        dry_run: run.dryRun === true,
        actor: run.actor || null,
        candidates: Number(run.candidates) || 0,
        skipped_already_sent: Number(run.skippedAlreadySent) || 0,
        dispatched: Number(run.dispatched) || 0,
        would_send: Number(run.wouldSend) || 0,
        no_token: Number(run.noToken) || 0,
        send_failed: Number(run.sendFailed) || 0,
        queued: Number(run.queued) || 0,
        truncated: run.truncated === true,
        push_configured: run.pushConfigured === true,
        recipients: normalizeRecipients(run.recipients),
        started_at: run.startedAt || new Date(),
        finished_at: run.finishedAt || new Date(),
        created_at: new Date(),
    };
    const result = await (await main()).collection(RUNS).insertOne(record);
    return toPublicRun({ ...record, _id: result.insertedId });
}

async function latestRun(jobId, { dryRun } = {}) {
    const filter = { job_id: jobId };
    if (dryRun === true) filter.dry_run = true;
    if (dryRun === false) filter.dry_run = false;
    const doc = await (await main()).collection(RUNS)
        .find(filter)
        .sort({ created_at: -1 })
        .limit(1)
        .next();
    return toPublicRun(doc);
}

async function latestRunsByJobIds(jobIds) {
    const ids = [...new Set((jobIds || []).filter(Boolean))];
    const out = {};
    if (!ids.length) return out;
    await Promise.all(ids.map(async (jobId) => {
        const [lastPreview, lastSend] = await Promise.all([
            latestRun(jobId, { dryRun: true }),
            latestRun(jobId, { dryRun: false }),
        ]);
        out[jobId] = { lastPreview, lastSend };
    }));
    return out;
}

/** @deprecated use latestRunsByJobIds */
async function latestByJobIds(jobIds) {
    const runs = await latestRunsByJobIds(jobIds);
    const out = {};
    for (const [jobId, pair] of Object.entries(runs)) {
        out[jobId] = pair.lastSend || pair.lastPreview || null;
    }
    return out;
}

async function wasSent(userId, type, day) {
    if (!userId || !type || !day) return false;
    const doc = await (await main()).collection(SENDS).findOne({
        user_id: String(userId),
        type: String(type),
        day: String(day),
    });
    return Boolean(doc);
}

async function markSent(userId, type, day) {
    if (!userId || !type || !day) return;
    await ensureIndexes();
    await (await main()).collection(SENDS).updateOne(
        { user_id: String(userId), type: String(type), day: String(day) },
        { $setOnInsert: { created_at: new Date() } },
        { upsert: true }
    );
}

module.exports = {
    RUNS,
    SENDS,
    ensureIndexes,
    toPublicRun,
    insertRun,
    latestRun,
    latestRunsByJobIds,
    latestByJobIds,
    wasSent,
    markSent,
};
