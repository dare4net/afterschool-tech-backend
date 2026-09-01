const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveClubScope, resolvePrideScopeMode, parseOrgIdQuery } = require('../helpers/clubScope');

describe('clubScope', () => {
    it('parses org_id query and treats personal as global', async () => {
        assert.equal(parseOrgIdQuery({ org_id: 'abc' }), 'abc');
        assert.equal(parseOrgIdQuery({}), '');

        const personal = await resolveClubScope({ orgId: 'personal', viewerId: 'u1' });
        assert.equal(personal.type, 'global');
        assert.equal(personal.userIds, null);
        assert.equal(personal.requireListed, true);

        const empty = await resolveClubScope({ orgId: '', viewerId: 'u1' });
        assert.equal(empty.type, 'global');
    });

    it('requires auth and membership for club scope', async () => {
        await assert.rejects(
            () => resolveClubScope({ orgId: 'org1', viewerId: null }),
            (err) => err.code === 'unauthorized'
        );
    });

    it('honours org prideScope setting over automatic cohort preference', () => {
        assert.equal(resolvePrideScopeMode('org', true), 'org');
        assert.equal(resolvePrideScopeMode('org', false), 'org');
        assert.equal(resolvePrideScopeMode('cohort', true), 'cohort');
        assert.equal(resolvePrideScopeMode('cohort', false), 'org');
    });
});
