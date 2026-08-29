const { getAuthenticatedUserId } = require('../helpers/actorUser');
const prideStats = require('../helpers/prideStats');
const { getPrideStat } = require('../helpers/prideCatalog');

function publicRow(row) {
    if (!row) return null;
    return {
        rank: row.rank,
        handle: row.handle || null,
        displayName: row.displayName,
        value: row.value,
        crown: row.crown || null,
        accentColor: row.accentColor || null,
        bestCrown: row.bestCrown || row.crown || null,
        following: row.following === true,
    };
}

function publicYou(you) {
    if (!you) return null;
    return {
        value: you.value ?? null,
        rank: you.rank ?? null,
        crown: you.crown || null,
        listed: you.listed === true,
        handle: you.handle || null,
        displayName: you.displayName || null,
        gapToNext: you.gapToNext || null,
    };
}

function decodeStatKey(raw) {
    const value = String(raw || '');
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

exports.listPride = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const summary = await prideStats.summaryFor(userId || null);
        res.json({
            success: true,
            catalog: summary.catalog.map((item) => ({
                key: item.key,
                label: item.label,
                sort: item.sort,
                unit: item.unit,
                group: item.group,
                featured: item.group === 'featured',
            })),
            stats: summary.stats.map((item) => ({
                key: item.key,
                label: item.label,
                sort: item.sort,
                unit: item.unit,
                group: item.group,
                featured: item.featured,
                you: publicYou(item.you),
                leaders: (item.leaders || []).map(publicRow),
            })),
        });
    } catch (err) {
        console.error('[PRIDE] Error listing pride stats:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getBoard = async (req, res) => {
    try {
        const spec = getPrideStat(decodeStatKey(req.params.statKey));
        if (!spec) {
            return res.status(404).json({ error: 'Unknown stat' });
        }
        const userId = getAuthenticatedUserId(req);
        const result = await prideStats.boardFor(spec.key, { userId: userId || null });
        if (result.error) {
            return res.status(result.status || 404).json({ error: result.error });
        }
        res.json({
            success: true,
            stat: {
                key: result.stat.key,
                label: result.stat.label,
                sort: result.stat.sort,
                unit: result.stat.unit,
                group: result.stat.group,
            },
            board: (result.board || []).map(publicRow),
            you: publicYou(result.you),
        });
    } catch (err) {
        console.error('[PRIDE] Error fetching pride board:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
