const { getAuthenticatedUserId } = require('../helpers/actorUser');
const onboarding = require('../helpers/onboarding');

exports.completeOnboarding = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (req.user?.role && req.user.role !== 'student') {
            return res.status(403).json({ error: 'Students only' });
        }
        const result = await onboarding.complete(userId, req.validatedBody || req.body || {});
        if (result.status && result.status !== 200) {
            return res.status(result.status).json({ error: result.error });
        }
        const { status, ...body } = result;
        res.json({ success: true, ...body });
    } catch (err) {
        console.error('[ONBOARDING] complete error:', err);
        res.status(500).json({ error: 'Could not finish onboarding' });
    }
};
