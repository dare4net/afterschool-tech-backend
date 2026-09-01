const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeVisibility,
    marketplaceCatalogFilter,
    asOrgId,
} = require('../helpers/programVisibility');

describe('program visibility helpers', () => {
    it('defaults visibility from org context', () => {
        assert.equal(normalizeVisibility(undefined, { hasOrg: true }), 'org');
        assert.equal(normalizeVisibility(undefined, { hasOrg: false }), 'marketplace');
        assert.equal(normalizeVisibility('unlisted'), 'unlisted');
        assert.equal(normalizeVisibility('MARKETPLACE'), 'marketplace');
    });

    it('builds a catalog filter that keeps legacy programs', () => {
        const filter = marketplaceCatalogFilter();
        assert.ok(Array.isArray(filter.$or));
        assert.ok(filter.$or.some((clause) => clause.visibility === 'marketplace'));
        assert.ok(filter.$or.some((clause) => clause.visibility && clause.visibility.$exists === false));
    });

    it('normalises org ids', () => {
        assert.equal(asOrgId(''), null);
        assert.equal(asOrgId(null), null);
        const oid = asOrgId('507f1f77bcf86cd799439011');
        assert.equal(String(oid), '507f1f77bcf86cd799439011');
    });
});
