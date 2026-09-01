const CODE_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function normalizeJoinCode(raw) {
    const code = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '');
    if (!code || code.length < 3 || code.length > 24) return null;
    if (!CODE_RE.test(code)) return null;
    return code;
}

function suggestJoinCode(orgSlug, cohortName) {
    const org = String(orgSlug || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 6) || 'ORG';
    const part = String(cohortName || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 6) || 'CLASS';
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return normalizeJoinCode(`${org}-${part}-${suffix}`) || `${org}-${suffix}`;
}

module.exports = {
    CODE_RE,
    normalizeJoinCode,
    suggestJoinCode,
};
