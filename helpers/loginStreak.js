function utcDay(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return Math.round((end - start) / 86400000);
}

function nextStreakState(progress = {}, today = utcDay(), freezeRemaining = 0) {
    const last = progress.lastLoginDate || null;
    let streak = Number(progress.loginStreak) || 0;
    let longest = Number(progress.longestLoginStreak) || 0;
    let usedFreeze = 0;
    let continued = false;
    let broken = false;

    if (last === today) {
        return {
            loginStreak: streak,
            longestLoginStreak: longest,
            lastLoginDate: last,
            alreadyCounted: true,
            continued: false,
            broken: false,
            usedFreeze: 0,
        };
    }

    const gap = last ? daysBetween(last, today) : null;
    if (!last) {
        streak = 1;
        continued = true;
    } else if (gap === 1) {
        streak += 1;
        continued = true;
    } else if (gap > 1) {
        const missed = gap - 1;
        if (freezeRemaining >= missed) {
            usedFreeze = missed;
            streak += 1;
            continued = true;
        } else {
            streak = 1;
            broken = true;
        }
    } else {
        streak = 1;
        continued = true;
    }

    longest = Math.max(longest, streak);
    return {
        loginStreak: streak,
        longestLoginStreak: longest,
        lastLoginDate: today,
        alreadyCounted: false,
        continued,
        broken,
        usedFreeze,
    };
}

module.exports = {
    utcDay,
    daysBetween,
    nextStreakState,
};
