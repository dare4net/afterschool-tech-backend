const { daysBetween } = require('./loginStreak');

function utcDayStart(today) {
    return new Date(`${today}T00:00:00.000Z`);
}

function isStreakAtRisk(row, today) {
    const streak = Number(row && row.loginStreak) || 0;
    if (streak < 1) return false;
    const last = (row && row.lastLoginDate) || null;
    if (!last || last === today) return false;
    return daysBetween(last, today) === 1;
}

function needsLessonNudge(reg, todayStart) {
    if (!reg || reg.status === 'unenrolled') return false;
    const pct = Number(reg.progress && reg.progress.percent_complete) || 0;
    if (pct <= 0 || pct >= 100) return false;
    if (!reg.last_activity) return true;
    const last = new Date(reg.last_activity);
    if (!Number.isFinite(last.getTime())) return true;
    return last < todayStart;
}

function pickLessonNudges(registrations, today, cap = 500) {
    const todayStart = utcDayStart(today);
    const byUser = new Map();
    for (const reg of registrations || []) {
        if (!needsLessonNudge(reg, todayStart)) continue;
        const userId = String(reg.user_id || '');
        if (!userId) continue;
        const prev = byUser.get(userId);
        const activity = reg.last_activity ? new Date(reg.last_activity).getTime() : 0;
        const prevActivity = prev && prev.last_activity ? new Date(prev.last_activity).getTime() : 0;
        if (!prev || activity >= prevActivity) byUser.set(userId, reg);
    }
    const picked = [...byUser.values()].sort((a, b) => {
        const ta = a.last_activity ? new Date(a.last_activity).getTime() : 0;
        const tb = b.last_activity ? new Date(b.last_activity).getTime() : 0;
        return tb - ta;
    });
    const limit = Math.max(1, Number(cap) || 500);
    return {
        nudges: picked.slice(0, limit),
        truncated: picked.length > limit,
        candidates: picked.length,
    };
}

function streakCopy(row) {
    const days = Number(row && row.loginStreak) || 1;
    return {
        title: `Don't lose your ${days}-day streak`,
        body: 'Open a lesson today to keep it going.',
        href: '/dashboard/student/streak',
    };
}

function lessonCopy(reg, programName) {
    const pct = Number(reg && reg.progress && reg.progress.percent_complete) || 0;
    const name = programName || 'your course';
    const programId = encodeURIComponent(String((reg && reg.program_id) || ''));
    return {
        title: `Pick up ${name}`,
        body: `You're ${pct}% through. Come back and keep going.`,
        href: programId ? `/dashboard/student/programs/${programId}` : '/dashboard/student',
    };
}

function programLabel(program) {
    return (program && (program.name || program.program_name || program.title)) || 'your course';
}

module.exports = {
    utcDayStart,
    isStreakAtRisk,
    needsLessonNudge,
    pickLessonNudges,
    streakCopy,
    lessonCopy,
    programLabel,
};
