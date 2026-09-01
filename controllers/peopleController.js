const { sanitizeHandle, handleError, publicProfileFields } = require('../helpers/publicProfile');
const { getAuthenticatedUserId } = require('../helpers/actorUser');
const usersRepo = require('../repositories/usersRepo');
const prideStats = require('../helpers/prideStats');
const followGraph = require('../helpers/followGraph');

const NOT_FOUND = { error: 'Profile not found' };

function publicCrown(item) {
    if (!item) return null;
    return {
        statKey: item.statKey,
        label: item.label,
        value: item.value,
        unit: item.unit,
        rank: item.rank,
        crown: item.crown,
    };
}

function publicWallItem(item) {
    if (!item) return null;
    return {
        key: item.key,
        label: item.label,
        unit: item.unit,
        group: item.group,
        sort: item.sort,
        value: item.value,
        rank: item.rank,
        crown: item.crown,
        gold: item.gold && item.gold.handle
            ? {
                handle: item.gold.handle,
                displayName: item.gold.displayName,
                value: item.gold.value,
                accentColor: item.gold.accentColor,
                avatarId: item.gold.avatarId || null,
                bestCrown: item.gold.bestCrown,
                following: item.gold.following === true,
            }
            : null,
    };
}

async function refreshFollowerPride(result) {
    if (!result || result.status !== 200) return;
    const ids = [...new Set([result.followeeId, result.actorId].filter(Boolean))];
    for (const id of ids) {
        const { followerCount } = await followGraph.counts(id);
        await prideStats.syncFromProgressEvent(id, 'FOLLOWERS_CHANGED', { count: followerCount });
    }
}

function sendGraphResult(res, result) {
    if (!result || result.status === 404) {
        return res.status(404).json(NOT_FOUND);
    }
    if (result.status && result.status !== 200) {
        return res.status(result.status).json({ error: result.error });
    }
    const { status, error, followeeId, actorId, ...body } = result;
    return res.json({ success: true, ...body });
}

exports.getPublicProfile = async (req, res) => {
    try {
        const handle = sanitizeHandle(req.params.handle);
        if (handleError(handle)) {
            return res.status(404).json(NOT_FOUND);
        }

        await usersRepo.ensureIndexes();
        const user = await usersRepo.findByHandle(handle);
        if (!user || user.isPublicProfile !== true) {
            return res.status(404).json(NOT_FOUND);
        }

        const viewerId = getAuthenticatedUserId(req);
        const [crowns, wall, graphCounts, viewer] = await Promise.all([
            prideStats.crownsForUser(user.user_id),
            prideStats.wallForUser(user.user_id, { viewerId }),
            followGraph.counts(user.user_id),
            viewerId ? followGraph.viewerState(viewerId, user.user_id) : Promise.resolve(null),
        ]);

        res.json({
            success: true,
            profile: {
                ...publicProfileFields(user),
                followerCount: graphCounts.followerCount,
                followingCount: graphCounts.followingCount,
                bestCrown: (crowns.gold && crowns.gold.length)
                    ? 'gold'
                    : (crowns.silver && crowns.silver.length)
                        ? 'silver'
                        : (crowns.bronze && crowns.bronze.length)
                            ? 'bronze'
                            : null,
                crownCount: crowns.total,
                goldCrowns: (crowns.gold || []).map(publicCrown).filter(Boolean),
                silverCrowns: (crowns.silver || []).map(publicCrown).filter(Boolean),
                bronzeCrowns: (crowns.bronze || []).map(publicCrown).filter(Boolean),
                wall: (wall || []).map(publicWallItem).filter(Boolean),
            },
            viewer,
        });
    } catch (err) {
        console.error('[PEOPLE] Error fetching public profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

function publicPerson(row) {
    if (!row) return null;
    if (!row.handle && !row.displayName) return null;
    return {
        handle: row.handle || null,
        displayName: row.displayName || row.handle || 'Student',
        userId: row.userId || null,
        accentColor: row.accentColor || null,
        avatarId: row.avatarId || null,
        avatarFrame: row.avatarFrame || null,
        nameplate: row.nameplate || null,
        bestCrown: row.bestCrown || row.best_crown || row.crown || null,
        following: row.following === true,
    };
}

function publicBoard(row) {
    if (!row) return null;
    return {
        key: row.key,
        label: row.label,
        unit: row.unit,
        gold: row.gold
            ? {
                handle: row.gold.handle || null,
                displayName: row.gold.displayName || row.gold.handle || 'Student',
                value: row.gold.value,
                accentColor: row.gold.accentColor,
                avatarId: row.gold.avatarId || null,
                bestCrown: row.gold.bestCrown,
                following: row.gold.following === true,
            }
            : null,
    };
}

exports.searchPeople = async (req, res) => {
    try {
        await usersRepo.ensureIndexes();
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const viewerId = getAuthenticatedUserId(req);
        const hideUserIds = viewerId ? await followGraph.hiddenUserIds(viewerId) : [];
        const { resolveClubScope, parseOrgIdQuery } = require('../helpers/clubScope');
        const orgId = parseOrgIdQuery(req.query);
        let scope;
        try {
            scope = await resolveClubScope({ orgId, viewerId });
        } catch (err) {
            if (err && err.code === 'unauthorized') {
                return res.status(401).json({ error: err.message, code: err.code });
            }
            if (err && err.code === 'org_forbidden') {
                return res.status(403).json({ error: err.message, code: err.code });
            }
            throw err;
        }
        const result = await prideStats.discover(q, {
            hideUserIds,
            viewerId,
            userIds: scope.userIds,
            requireListed: scope.requireListed,
        });
        res.json({
            success: true,
            mode: result.mode,
            scope: {
                type: scope.type,
                orgId: scope.orgId,
                cohortId: scope.cohortId || null,
            },
            people: (result.people || []).map(publicPerson).filter(Boolean),
            boards: (result.boards || []).map(publicBoard).filter(Boolean),
        });
    } catch (err) {
        console.error('[PEOPLE] Error searching people:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.followPerson = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await followGraph.follow(userId, req.params.handle);
        await refreshFollowerPride(result);
        return sendGraphResult(res, result);
    } catch (err) {
        console.error('[PEOPLE] Error following:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.unfollowPerson = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await followGraph.unfollow(userId, req.params.handle);
        await refreshFollowerPride(result);
        return sendGraphResult(res, result);
    } catch (err) {
        console.error('[PEOPLE] Error unfollowing:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.mutePerson = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        return sendGraphResult(res, await followGraph.mute(userId, req.params.handle, req.body && req.body.muted === true));
    } catch (err) {
        console.error('[PEOPLE] Error muting:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.blockPerson = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await followGraph.block(userId, req.params.handle);
        await refreshFollowerPride(result);
        return sendGraphResult(res, result);
    } catch (err) {
        console.error('[PEOPLE] Error blocking:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.unblockPerson = async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await followGraph.unblock(userId, req.params.handle);
        await refreshFollowerPride(result);
        return sendGraphResult(res, result);
    } catch (err) {
        console.error('[PEOPLE] Error unblocking:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
