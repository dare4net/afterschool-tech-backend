const { normalizeOrgSlug } = require('./orgSlug');

const STATIC_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://v0-afterschool-tech.vercel.app',
    'https://v0-afterschool-tech-git-beta-chatzteam-gmailcoms-projects.vercel.app',
    'https://app.after-school.tech',
    'https://afterschool-tech-beta.vercel.app',
    'https://ast4-lesson-builder-chatzteam-gmailcoms-projects.vercel.app',
    'https://ast.devinna.com',
    'https://ast4-lesson-builder.vercel.app',
];

const LOCALHOST_DEV_PORTS = new Set(['3000', '3001', '']);

function vanityRootDomain() {
    return String(process.env.VANITY_ROOT_DOMAIN || 'after-school.tech').toLowerCase();
}

function vanitySubdomain(hostname, suffix) {
    if (!hostname.endsWith(suffix) || hostname === suffix.slice(1)) return null;
    const sub = hostname.slice(0, -suffix.length);
    if (!sub || sub.includes('.')) return null;
    return normalizeOrgSlug(sub);
}

function isVanityLocalhostOrigin(origin) {
    try {
        const url = new URL(origin);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        if (!LOCALHOST_DEV_PORTS.has(url.port)) return false;
        return Boolean(vanitySubdomain(url.hostname.toLowerCase(), '.localhost'));
    } catch {
        return false;
    }
}

function isVanityProductionOrigin(origin) {
    try {
        const url = new URL(origin);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        const root = vanityRootDomain();
        return Boolean(vanitySubdomain(url.hostname.toLowerCase(), `.${root}`));
    } catch {
        return false;
    }
}

function isAllowedCorsOrigin(origin) {
    if (!origin) return true;
    if (STATIC_ORIGINS.includes(origin)) return true;
    if (isVanityLocalhostOrigin(origin)) return true;
    if (isVanityProductionOrigin(origin)) return true;
    return false;
}

function createCorsOriginCallback() {
    return (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    };
}

module.exports = {
    STATIC_ORIGINS,
    isAllowedCorsOrigin,
    isVanityLocalhostOrigin,
    isVanityProductionOrigin,
    createCorsOriginCallback,
};
