const liveAggregatesRepo = require('../repositories/liveAggregatesRepo');

function snapshot(res, payload) {
    return res.json({ success: true, ...payload });
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
        return snapshot(res, data);
    } catch (err) {
        console.error('[WORDCLOUD] POST error:', err);
        res.status(500).json({ error: 'Failed to add word' });
    }
};
