const defaultFollowsRepo = require('../repositories/followsRepo');
const defaultUsersRepo = require('../repositories/usersRepo');
const { notify: defaultNotify } = require('./notify');
const { sanitizeHandle, handleError } = require('./publicProfile');

const NOT_FOUND = { status: 404, error: 'Profile not found' };

function createFollowGraph({
    followsRepo = defaultFollowsRepo,
    usersRepo = defaultUsersRepo,
    notify = defaultNotify,
} = {}) {
    async function loadPublicByHandle(handle) {
        const clean = sanitizeHandle(handle);
        if (handleError(clean)) return null;
        await usersRepo.ensureIndexes();
        const user = await usersRepo.findByHandle(clean);
        if (!user || user.isPublicProfile !== true) return null;
        return user;
    }

    async function follow(followerId, handle) {
        const target = await loadPublicByHandle(handle);
        if (!target) return NOT_FOUND;
        if (target.user_id === followerId) {
            return { status: 400, error: 'Cannot follow yourself' };
        }
        await followsRepo.ensureIndexes();
        if (await followsRepo.blockedEitherWay(followerId, target.user_id)) {
            return { status: 403, error: 'Cannot follow' };
        }
        const created = await followsRepo.insertFollow(followerId, target.user_id);
        if (created) {
            const actor = await usersRepo.findByUserId(followerId);
            const name = (actor && (actor.full_name || actor.name || actor.handle)) || 'A student';
            const href = actor && actor.handle && actor.isPublicProfile === true
                ? `/dashboard/student/u/${encodeURIComponent(actor.handle)}`
                : '/dashboard/student/pride';
            await notify({
                userId: target.user_id,
                actorId: followerId,
                type: 'FOLLOWED_YOU',
                title: `${name} followed you`,
                body: 'They will see when you take gold',
                href,
            });
        }
        return { status: 200, following: true, followeeId: target.user_id };
    }

    async function unfollow(followerId, handle) {
        const target = await loadPublicByHandle(handle);
        if (!target) return NOT_FOUND;
        await followsRepo.ensureIndexes();
        await followsRepo.deleteFollow(followerId, target.user_id);
        return { status: 200, following: false, followeeId: target.user_id };
    }

    async function mute(followerId, handle, muted) {
        const target = await loadPublicByHandle(handle);
        if (!target) return NOT_FOUND;
        await followsRepo.ensureIndexes();
        const ok = await followsRepo.setMuted(followerId, target.user_id, muted === true);
        if (!ok) return { status: 400, error: 'Follow them first' };
        return { status: 200, muted: muted === true };
    }

    async function block(actorId, handle) {
        const target = await loadPublicByHandle(handle);
        if (!target) return NOT_FOUND;
        if (target.user_id === actorId) {
            return { status: 400, error: 'Cannot block yourself' };
        }
        await followsRepo.ensureIndexes();
        await followsRepo.insertBlock(actorId, target.user_id);
        await followsRepo.deleteEdgesBetween(actorId, target.user_id);
        return { status: 200, blocked: true, actorId, followeeId: target.user_id };
    }

    async function unblock(actorId, handle) {
        const target = await loadPublicByHandle(handle);
        if (!target) return NOT_FOUND;
        await followsRepo.ensureIndexes();
        await followsRepo.deleteBlock(actorId, target.user_id);
        return { status: 200, blocked: false, actorId, followeeId: target.user_id };
    }

    async function counts(userId) {
        await followsRepo.ensureIndexes();
        const [followerCount, followingCount] = await Promise.all([
            followsRepo.countFollowers(userId),
            followsRepo.countFollowing(userId),
        ]);
        return { followerCount, followingCount };
    }

    async function viewerState(viewerId, targetId) {
        if (!viewerId || !targetId) {
            return { isSelf: false, following: false, muted: false, blocked: false };
        }
        if (viewerId === targetId) {
            return { isSelf: true, following: false, muted: false, blocked: false };
        }
        await followsRepo.ensureIndexes();
        const [edge, blocked] = await Promise.all([
            followsRepo.getFollow(viewerId, targetId),
            followsRepo.isBlocked(viewerId, targetId),
        ]);
        return {
            isSelf: false,
            following: Boolean(edge),
            muted: Boolean(edge && edge.muted === true),
            blocked: Boolean(blocked),
        };
    }

    async function listFollowerIds(followeeId, { unmutedOnly = false } = {}) {
        await followsRepo.ensureIndexes();
        const rows = await followsRepo.listFollowers(followeeId, { unmutedOnly });
        const ids = [];
        for (const row of rows) {
            if (await followsRepo.blockedEitherWay(followeeId, row.follower_id)) continue;
            ids.push(row.follower_id);
        }
        return ids;
    }

    async function followingSet(followerId, followeeIds) {
        if (!followerId) return [];
        await followsRepo.ensureIndexes();
        if (typeof followsRepo.followingSet !== 'function') return [];
        return followsRepo.followingSet(followerId, followeeIds);
    }

    async function hiddenUserIds(viewerId) {
        if (!viewerId) return [];
        await followsRepo.ensureIndexes();
        return followsRepo.hiddenUserIds(viewerId);
    }

    return {
        follow,
        unfollow,
        mute,
        block,
        unblock,
        counts,
        viewerState,
        listFollowerIds,
        followingSet,
        hiddenUserIds,
        loadPublicByHandle,
    };
}

const defaults = createFollowGraph();

module.exports = {
    createFollowGraph,
    ...defaults,
};
