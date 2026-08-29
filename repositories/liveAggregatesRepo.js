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

async function polls() {
    return (await getLessonsDb()).collection('polls');
}

async function wordClouds() {
    return (await getLessonsDb()).collection('wordclouds');
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
    return {
        votes: doc?.votes || { [safeOption]: 1 },
        totalVotes: doc?.totalVotes || 1,
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
    return { counts: denormalizeCounts(doc?.counts || { [key]: 1 }) };
}

module.exports = {
    normalizeCloudWord,
    getPoll,
    incrementPollVote,
    getWordCloud,
    addWordCloudWord,
    denormalizeCounts,
};
