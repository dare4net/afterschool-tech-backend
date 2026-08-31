const liveAggregatesRepo = require('../repositories/liveAggregatesRepo');
const { getAuthenticatedUserId } = require('../helpers/actorUser');
const classActivity = require('../helpers/classActivity');

function snapshot(res, payload) {
    return res.json({ success: true, ...payload });
}

function fanout(promise) {
    Promise.resolve(promise).catch((err) => {
        console.error('[CLASS-ACTIVITY] fanout failed:', err);
    });
}

exports.getPoll = async (req, res) => {
    try {
        const { lessonId, componentId } = req.validatedQuery;
        const data = await liveAggregatesRepo.getPoll(lessonId, componentId);
        return snapshot(res, data);
    } catch (err) {
        console.error('[POLLS] GET error:', err);
        res.status(500).json({ error: 'Failed to load poll' });
    }
};

exports.votePoll = async (req, res) => {
    try {
        const { lessonId, componentId, optionId } = req.validatedBody;
        const data = await liveAggregatesRepo.incrementPollVote(lessonId, componentId, optionId);
        fanout(classActivity.onPollVote({
            lessonId,
            componentId,
            actorId: getAuthenticatedUserId(req),
            previousTotal: data.previousTotal,
            nextTotal: data.totalVotes,
        }));
        return snapshot(res, data);
    } catch (err) {
        console.error('[POLLS] POST error:', err);
        res.status(500).json({ error: 'Failed to submit vote' });
    }
};

exports.getWordCloud = async (req, res) => {
    try {
        const { lessonId, componentId } = req.validatedQuery;
        const data = await liveAggregatesRepo.getWordCloud(lessonId, componentId);
        return snapshot(res, data);
    } catch (err) {
        console.error('[WORDCLOUD] GET error:', err);
        res.status(500).json({ error: 'Failed to load word cloud' });
    }
};

exports.addWordCloudWord = async (req, res) => {
    try {
        const { lessonId, componentId, word } = req.validatedBody;
        const data = await liveAggregatesRepo.addWordCloudWord(lessonId, componentId, word);
        if (data.error) {
            return res.status(data.status || 400).json({ error: data.error });
        }
        fanout(classActivity.onCloudWord({
            lessonId,
            componentId,
            actorId: getAuthenticatedUserId(req),
            previousTotal: data.previousTotal,
            nextTotal: data.total,
        }));
        return snapshot(res, data);
    } catch (err) {
        console.error('[WORDCLOUD] POST error:', err);
        res.status(500).json({ error: 'Failed to add word' });
    }
};

exports.getScale = async (req, res) => {
    try {
        const { lessonId, componentId } = req.validatedQuery;
        const data = await liveAggregatesRepo.getScale(lessonId, componentId);
        return snapshot(res, data);
    } catch (err) {
        console.error('[SCALE] GET error:', err);
        res.status(500).json({ error: 'Failed to load scale' });
    }
};

exports.rateScale = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const { lessonId, componentId, value } = req.validatedBody;
        const data = await liveAggregatesRepo.setScaleRating(lessonId, componentId, userId, value);
        if (data.error) {
            return res.status(data.status || 400).json({ error: data.error });
        }
        fanout(classActivity.onScaleRating({
            lessonId,
            componentId,
            actorId: userId,
            previousTotal: data.previousTotal,
            nextTotal: data.total,
        }));
        return snapshot(res, data);
    } catch (err) {
        console.error('[SCALE] POST error:', err);
        res.status(500).json({ error: 'Failed to submit rating' });
    }
};
