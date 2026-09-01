const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { ObjectId } = require('mongodb');
const {
    isStudioRole,
    canEditProgram,
    programBelongsToOrg,
} = require('../helpers/studioAccess');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

describe('studio access helpers', () => {
    it('allows tutors and org owners into studio routes', () => {
        assert.equal(isStudioRole('tutor'), true);
        assert.equal(isStudioRole('organization'), true);
        assert.equal(isStudioRole('student'), false);
        assert.match(read('routes/studioRoutes.js'), /requireStudioAccess/);
        assert.match(read('routes/studioRoutes.js'), /isStudioRole/);
        assert.doesNotMatch(read('routes/studioRoutes.js'), /requireTutor/);
    });

    it('lets org owners edit any program in their club', async () => {
        const orgId = new ObjectId().toString();
        const program = {
            tutor_id: 'tutor01',
            org_id: new ObjectId(orgId),
        };
        const staffCtx = { ownerOrgIds: [orgId], staff: [] };
        assert.equal(await canEditProgram(program, 'owner01', staffCtx), true);
        assert.equal(await canEditProgram(program, 'other99'), false);
        assert.equal(programBelongsToOrg(program.org_id, orgId), true);
    });

    it('lets authors edit their own programs without org ownership', async () => {
        const program = { tutor_id: 'tutor01', org_id: null };
        assert.equal(await canEditProgram(program, 'tutor01'), true);
        assert.equal(await canEditProgram(program, 'tutor02'), false);
    });
});
