const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugifyOrgName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function normalizeOrgSlug(raw) {
    const slug = String(raw || '').trim().toLowerCase();
    if (!slug || slug.length < 2 || slug.length > 48) return null;
    if (!SLUG_RE.test(slug)) return null;
    const reserved = new Set([
        'www', 'app', 'api', 'admin', 'superadmin', 'studio', 'dashboard',
        'auth', 'login', 'signup', 'static', 'assets', 'mail', 'status',
    ]);
    if (reserved.has(slug)) return null;
    return slug;
}

function seatCountsForRole(role) {
    return role === 'student';
}

module.exports = {
    SLUG_RE,
    slugifyOrgName,
    normalizeOrgSlug,
    seatCountsForRole,
};
