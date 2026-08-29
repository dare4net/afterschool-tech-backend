const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

const RESERVED_HANDLES = new Set([
    'admin',
    'api',
    'auth',
    'dashboard',
    'editor',
    'login',
    'me',
    'people',
    'pride',
    'settings',
    'studio',
    'superadmin',
    'support',
    'tutor',
    'u',
    'viewer',
]);

function sanitizeHandle(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
}

function handleError(handle) {
    if (!handle) return 'Handle is required';
    if (!HANDLE_PATTERN.test(handle)) {
        return 'Use 3–24 characters: start with a letter, then letters, numbers, or _';
    }
    if (RESERVED_HANDLES.has(handle)) {
        return 'That handle is reserved';
    }
    return null;
}

const ACCENT_COLORS = ['#58CC02', '#1CB0F6', '#FF9600', '#CE82FF', '#FF4B4B'];

function isAccentColor(value) {
    return ACCENT_COLORS.includes(String(value || '').toUpperCase())
        || ACCENT_COLORS.includes(String(value || ''));
}

function defaultAccentColor(handle) {
    const text = String(handle || '');
    let n = 0;
    for (let i = 0; i < text.length; i += 1) {
        n = (n + text.charCodeAt(i) * (i + 1)) % ACCENT_COLORS.length;
    }
    return ACCENT_COLORS[n];
}

function resolveAccentColor(userOrHandle, chosen) {
    const picked = typeof userOrHandle === 'object' && userOrHandle
        ? userOrHandle.accentColor
        : chosen;
    if (isAccentColor(picked)) {
        const match = ACCENT_COLORS.find((color) => color.toLowerCase() === String(picked).toLowerCase());
        return match || ACCENT_COLORS[0];
    }
    const handle = typeof userOrHandle === 'object' && userOrHandle
        ? userOrHandle.handle
        : userOrHandle;
    return defaultAccentColor(handle);
}

function publicProfileFields(user) {
    if (!user) return null;
    return {
        handle: user.handle || null,
        displayName: user.full_name || user.name || user.handle || 'Student',
        accentColor: resolveAccentColor(user),
    };
}

function escapeSearchQuery(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstNameSlug(displayName, userId) {
    const first = String(displayName || '').trim().split(/\s+/)[0] || '';
    let slug = first
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    if (!slug) {
        const extra = String(userId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        slug = extra.replace(/^[0-9]+/, '') || 'student';
    }
    if (!/^[a-z]/.test(slug)) slug = `s${slug}`;
    if (slug.length < 3) {
        const extra = String(userId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        slug = `${slug}${extra}xxx`.replace(/[^a-z0-9]/g, '');
        if (!/^[a-z]/.test(slug)) slug = `s${slug}`;
    }
    if (slug.length < 3) slug = 'student';
    return slug.slice(0, 20);
}

function allocateHandleFromName(displayName, taken, { existingHandle, userId } = {}) {
    const current = sanitizeHandle(existingHandle || '');
    if (current && !handleError(current) && !taken.has(current)) {
        return current;
    }
    const base = firstNameSlug(displayName, userId);
    for (let n = 1; n <= 999; n += 1) {
        const suffix = n === 1 ? '' : String(n);
        const candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
        if (handleError(candidate) || taken.has(candidate)) continue;
        return candidate;
    }
    throw new Error('Could not allocate handle');
}

module.exports = {
    HANDLE_PATTERN,
    RESERVED_HANDLES,
    sanitizeHandle,
    handleError,
    ACCENT_COLORS,
    isAccentColor,
    defaultAccentColor,
    resolveAccentColor,
    publicProfileFields,
    escapeSearchQuery,
    firstNameSlug,
    allocateHandleFromName,
};
