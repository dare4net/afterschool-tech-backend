const { ObjectId } = require('mongodb');

const VISIBILITIES = new Set(['org', 'marketplace', 'unlisted']);

function normalizeVisibility(value, { hasOrg = false } = {}) {
    const v = String(value || '').trim().toLowerCase();
    if (VISIBILITIES.has(v)) return v;
    return hasOrg ? 'org' : 'marketplace';
}

function asOrgId(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (ObjectId.isValid(raw) && String(new ObjectId(raw)) === raw) {
        return new ObjectId(raw);
    }
    return raw;
}

/** Public catalog: marketplace programs, plus legacy rows with no visibility field. */
function marketplaceCatalogFilter() {
    return {
        $or: [
            { visibility: 'marketplace' },
            { visibility: { $exists: false } },
            { visibility: null },
        ],
    };
}

module.exports = {
    VISIBILITIES,
    normalizeVisibility,
    asOrgId,
    marketplaceCatalogFilter,
};
