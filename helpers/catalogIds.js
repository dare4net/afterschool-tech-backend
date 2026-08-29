const CATALOG_ID_MAX = 64;

function slugifyCatalogId(value, maxLen = 40) {
    const slug = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLen);
    return slug;
}

function ensureLetterStart(id, fallback) {
    if (/^[a-z]/.test(id)) return id;
    return `${fallback}-${id}`.replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
}

function allocateCatalogId({ kind, title, level, existingIds = [] } = {}) {
    const taken = new Set(existingIds);
    const slug = slugifyCatalogId(title) || kind || 'item';
    const prefix = kind === 'mission' ? `l${Number(level) || 1}-` : '';
    let base = ensureLetterStart(`${prefix}${slug}`, kind || 'item').slice(0, CATALOG_ID_MAX);
    if (!base) base = kind === 'mission' ? `l${Number(level) || 1}-item` : 'item';

    if (!taken.has(base)) return base;
    for (let n = 2; n <= 99; n += 1) {
        const suffix = `-${n}`;
        const id = `${base.slice(0, CATALOG_ID_MAX - suffix.length)}${suffix}`;
        if (!taken.has(id)) return id;
    }
    throw new Error('Could not allocate catalog id');
}

module.exports = {
    slugifyCatalogId,
    allocateCatalogId,
};
