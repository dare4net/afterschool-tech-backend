const { getLessonsDb } = require('../config/database');

function normalizeCloudWord(input) {
    const trimmed = String(input || '').trim().toLowerCase().slice(0, 40);
    const cleaned = trimmed.replace(/[^a-z0-9 '\-]/gi, '').replace(/[.$]/g, '').trim();
    return cleaned || null;
}

function denormalizeCounts(counts) {
    const out = {};
    for (const [key, value] of Object.entries(counts || {})) {
        out[key.replace(/_/g, ' ')] = value;
    }
    return out;
}

function cloudTotal(counts) {
    return Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

async function polls() {
    return (await getLessonsDb()).collection('polls');
}

async function wordClouds() {
    return (await getLessonsDb()).collection('wordclouds');
}

async function scales() {
    return (await getLessonsDb()).collection('scales');
}

function scaleSnapshot(doc) {
    const ratings = doc?.ratings && typeof doc.ratings === 'object' ? doc.ratings : {};
    const values = Object.values(ratings).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    const buckets = {};
    let sum = 0;
    for (const value of values) {
        const key = String(value);
        buckets[key] = (buckets[key] || 0) + 1;
        sum += value;
    }
    const total = values.length;
    return {
        buckets,
        total,
        sum,
        average: total ? Math.round((sum / total) * 10) / 10 : 0,
    };
}

async function getPoll(lessonId, componentId) {
    const doc = await (await polls()).findOne({ lessonId, componentId });
    return {
        votes: doc?.votes || {},
        totalVotes: doc?.totalVotes || 0,
    };
}

async function incrementPollVote(lessonId, componentId, optionId) {
    const safeOption = String(optionId).replace(/[.$]/g, '').slice(0, 64);
    const result = await (await polls()).findOneAndUpdate(
        { lessonId, componentId },
        {
            $inc: { [`votes.${safeOption}`]: 1, totalVotes: 1 },
            $set: { updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
    );
    const doc = result?.value || result;
    const totalVotes = doc?.totalVotes || 1;
    return {
        votes: doc?.votes || { [safeOption]: 1 },
        totalVotes,
        previousTotal: Math.max(0, totalVotes - 1),
    };
}

async function getWordCloud(lessonId, componentId) {
    const doc = await (await wordClouds()).findOne({ lessonId, componentId });
    return { counts: denormalizeCounts(doc?.counts) };
}

async function addWordCloudWord(lessonId, componentId, word) {
    const normalized = normalizeCloudWord(word);
    if (!normalized) {
        return { error: 'Invalid word', status: 400 };
    }
    const key = normalized.replace(/\s+/g, '_');
    const result = await (await wordClouds()).findOneAndUpdate(
        { lessonId, componentId },
        {
            $inc: { [`counts.${key}`]: 1 },
            $set: { updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
    );
    const doc = result?.value || result;
    const counts = denormalizeCounts(doc?.counts || { [key]: 1 });
    const total = cloudTotal(counts);
    return {
        counts,
        total,
        previousTotal: Math.max(0, total - 1),
    };
}

async function getScale(lessonId, componentId) {
    const doc = await (await scales()).findOne({ lessonId, componentId });
    return scaleSnapshot(doc);
}

async function setScaleRating(lessonId, componentId, userId, value) {
    const safeUser = String(userId || '').replace(/[.$]/g, '').slice(0, 64);
    const numeric = Number(value);
    if (!safeUser || !Number.isFinite(numeric)) {
        return { error: 'Invalid rating', status: 400 };
    }
    const existing = await (await scales()).findOne({ lessonId, componentId });
    const hadUser = Boolean(existing && existing.ratings && existing.ratings[safeUser] != null);
    const result = await (await scales()).findOneAndUpdate(
        { lessonId, componentId },
        {
            $set: { [`ratings.${safeUser}`]: numeric, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
    );
    const snapshot = scaleSnapshot(result?.value || result);
    return {
        ...snapshot,
        previousTotal: hadUser ? snapshot.total : Math.max(0, snapshot.total - 1),
    };
}

module.exports = {
    normalizeCloudWord,
    getPoll,
    incrementPollVote,
    getWordCloud,
    addWordCloudWord,
    denormalizeCounts,
    cloudTotal,
    getScale,
    setScaleRating,
    scaleSnapshot,
};
