const { getMainDb } = require('../config/database');

const RUNS = 'job_runs';
const SENDS = 'reminder_sends';

async function main() {
    return getMainDb();
}

async function ensureIndexes() {
    const db = await main();
    await db.collection(RUNS).createIndex({ job_id: 1, created_at: -1 });
    await db.collection(SENDS).createIndex(
        { user_id: 1, type: 1, day: 1 },
        { unique: true, name: 'reminder_sends_unique' }
    );
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
        queued: Number(doc.queued) || 0,
        truncated: doc.truncated === true,
        pushConfigured: doc.push_configured === true,
        sample: Array.isArray(doc.sample) ? doc.sample : [],
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
        queued: Number(run.queued) || 0,
        truncated: run.truncated === true,
        push_configured: run.pushConfigured === true,
        sample: Array.isArray(run.sample) ? run.sample.slice(0, 8) : [],
        started_at: run.startedAt || new Date(),
        finished_at: run.finishedAt || new Date(),
        created_at: new Date(),
    };
    const result = await (await main()).collection(RUNS).insertOne(record);
    return toPublicRun({ ...record, _id: result.insertedId });
}

async function latestByJobIds(jobIds) {
    const ids = [...new Set((jobIds || []).filter(Boolean))];
    const out = {};
    if (!ids.length) return out;
    const db = await main();
    await Promise.all(ids.map(async (jobId) => {
        const doc = await db.collection(RUNS)
            .find({ job_id: jobId })
            .sort({ created_at: -1 })
            .limit(1)
            .next();
        out[jobId] = toPublicRun(doc);
    }));
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
    latestByJobIds,
    wasSent,
    markSent,
};
