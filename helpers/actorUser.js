/**
 * Identity for wallet/stats/personal leaderboard.
 * Always from the JWT-backed req.user — never from query or body.
 */
function getAuthenticatedUserId(req) {
    const id = req.user?.user_id || req.user?.id;
    return id ? String(id) : null;
}

/**
 * Lesson viewer identity: students always load their own interaction.
 * Tutors may pass ?userId= to inspect a student (tutor-view).
 */
function resolveLessonViewerUserId(req) {
    const self = getAuthenticatedUserId(req);
    const requested = req.query?.userId ? String(req.query.userId) : null;
    if (req.user?.role === 'tutor' && requested) {
        return requested;
    }
    return self;
}

function requestedUserId(req) {
    const fromQuery = req.query?.userId ? String(req.query.userId) : null;
    const fromBody = req.body?.userId ? String(req.body.userId) : null;
    return fromQuery || fromBody;
}

/**
 * Students may only access their own interaction.
 * Tutors may pass userId (query or body) to inspect or save a student row.
 */
function resolveInteractionUserId(req) {
    const self = getAuthenticatedUserId(req);
    if (!self) {
        return { status: 401, error: 'Unauthorized' };
    }
    const requested = requestedUserId(req);
    if (req.user?.role === 'tutor') {
        if (!requested) {
            return { status: 400, error: 'Missing userId' };
        }
        return { userId: requested };
    }
    if (requested && requested !== self) {
        return { status: 403, error: "Cannot access another student's interaction" };
    }
    return { userId: self };
}

module.exports = { getAuthenticatedUserId, resolveLessonViewerUserId, resolveInteractionUserId };
