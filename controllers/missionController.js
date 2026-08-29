const { getAuthenticatedUserId } = require('../helpers/actorUser');
const { createStudentProgress } = require('../helpers/studentProgress');
const platformCatalog = require('../helpers/platformCatalog');

const progress = createStudentProgress({ catalog: platformCatalog });

exports.getCatalog = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const missions = await platformCatalog.listMissions({ includeDisabled: false });
        res.json({ success: true, missions });
    } catch (err) {
        console.error('[MISSIONS] Error listing catalog:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.claimMission = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { missionId } = req.validatedBody;

        const result = await progress.claimMission(userId, missionId);
        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[MISSIONS] Error claiming mission:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.levelUp = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const result = await progress.levelUp(userId);
        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[MISSIONS] Error leveling up:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
