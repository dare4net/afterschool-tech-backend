const { getAuthenticatedUserId } = require('../helpers/actorUser');
const starStore = require('../helpers/starStore');
const { lessonResetCost, maxStarsForLesson } = require('../helpers/starMarket');
const { resolveLessonRef } = require('../helpers/lessonRef');

exports.getStore = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const data = await starStore.snapshot(userId);
        res.json({ success: true, ...data });
    } catch (err) {
        console.error('[STORE] GET error:', err);
        res.status(500).json({ error: 'Failed to load store' });
    }
};

exports.buy = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await starStore.buyCharge(userId, req.validatedBody.sku);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] BUY error:', err);
        res.status(500).json({ error: 'Failed to buy powerup' });
    }
};

exports.upgrade = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await starStore.upgrade(userId, req.validatedBody.sku);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] UPGRADE error:', err);
        res.status(500).json({ error: 'Failed to upgrade powerup' });
    }
};

exports.activate = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await starStore.activate(userId, req.validatedBody.sku);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] ACTIVATE error:', err);
        res.status(500).json({ error: 'Failed to activate powerup' });
    }
};

exports.resetLesson = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await starStore.resetLesson(userId, req.validatedBody.lessonId);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] RESET error:', err);
        res.status(500).json({ error: 'Failed to reset lesson' });
    }
};

exports.quoteReset = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const lessonId = req.validatedQuery.lessonId;
        const ref = await resolveLessonRef(lessonId);
        if (!ref?.content) return res.status(404).json({ error: 'Lesson not found' });
        res.json({
            success: true,
            lessonId: ref.publicId || lessonId,
            cost: lessonResetCost(ref.content),
            maxStars: maxStarsForLesson(ref.content),
        });
    } catch (err) {
        console.error('[STORE] QUOTE error:', err);
        res.status(500).json({ error: 'Failed to quote reset' });
    }
};

exports.consume = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await starStore.consumeCharge(userId, req.validatedBody.sku);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] CONSUME error:', err);
        res.status(500).json({ error: 'Failed to consume that.' });
    }
};

exports.resetBlock = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await starStore.resetBlock(userId, req.validatedBody.lessonId, req.validatedBody.componentId);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] RESET BLOCK error:', err);
        res.status(500).json({ error: 'Failed to reset that block.' });
    }
};

exports.openReference = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const kind = req.validatedBody.kind === 'live' ? 'live' : 'practice';
        const result = await starStore.openReference(userId, kind);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] REFERENCE error:', err);
        res.status(500).json({ error: 'Failed to open reference.' });
    }
};

exports.printCertificate = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { kind, lessonId, statKey } = req.validatedBody;
        const result = await starStore.printCertificate(userId, kind, lessonId || statKey);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[STORE] PRINT CERT error:', err);
        res.status(500).json({ error: 'Failed to print certificate' });
    }
};
