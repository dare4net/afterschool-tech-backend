const platformCatalog = require('../helpers/platformCatalog');
const { MISSION_STAT_KEYS } = require('../helpers/platformMissions');
const { ACHIEVEMENT_EVENT_TYPES, ACHIEVEMENT_FIELDS_BY_EVENT, RULE_OPS } = require('../helpers/platformAchievements');
const { SCORED_COMPONENT_TYPES } = require('../contracts/platform');

function handleResult(res, result) {
    if (result?.error) {
        return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json({ success: true, ...result });
}

exports.getMeta = async (_req, res) => {
    res.json({
        success: true,
        missionStats: MISSION_STAT_KEYS,
        scoredComponentTypes: SCORED_COMPONENT_TYPES,
        modes: ['live', 'practice'],
        achievementEventTypes: ACHIEVEMENT_EVENT_TYPES,
        achievementFieldsByEvent: ACHIEVEMENT_FIELDS_BY_EVENT,
        ruleOps: RULE_OPS,
    });
};

exports.listMissions = async (_req, res) => {
    try {
        const missions = await platformCatalog.listMissions({ includeDisabled: true });
        res.json({ success: true, missions });
    } catch (err) {
        console.error('[CATALOG] Error listing missions:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.createMission = async (req, res) => {
    try {
        const result = await platformCatalog.createMission(req.validatedBody);
        return handleResult(res, result);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Mission id already exists' });
        }
        console.error('[CATALOG] Error creating mission:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.updateMission = async (req, res) => {
    try {
        const result = await platformCatalog.patchMission(req.params.id, req.validatedBody);
        return handleResult(res, result);
    } catch (err) {
        console.error('[CATALOG] Error updating mission:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteMission = async (req, res) => {
    try {
        const result = await platformCatalog.removeMission(req.params.id);
        return handleResult(res, result);
    } catch (err) {
        console.error('[CATALOG] Error deleting mission:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.listAchievements = async (_req, res) => {
    try {
        const achievements = await platformCatalog.listAchievements({ includeDisabled: true });
        res.json({ success: true, achievements });
    } catch (err) {
        console.error('[CATALOG] Error listing achievements:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.createAchievement = async (req, res) => {
    try {
        const result = await platformCatalog.createAchievement(req.validatedBody);
        return handleResult(res, result);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Achievement id already exists' });
        }
        console.error('[CATALOG] Error creating achievement:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.updateAchievement = async (req, res) => {
    try {
        const result = await platformCatalog.patchAchievement(req.params.id, req.validatedBody);
        return handleResult(res, result);
    } catch (err) {
        console.error('[CATALOG] Error updating achievement:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteAchievement = async (req, res) => {
    try {
        const result = await platformCatalog.removeAchievement(req.params.id);
        return handleResult(res, result);
    } catch (err) {
        console.error('[CATALOG] Error deleting achievement:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
