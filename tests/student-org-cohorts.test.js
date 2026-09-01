const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

describe('student org cohort enrichment', () => {
    it('wires cohort lookup into /orgs/mine', () => {
        assert.match(read('helpers/studentOrgCohorts.js'), /enrichOrgRowsWithStudentCohorts/);
        assert.match(read('controllers/orgsController.js'), /enrichOrgRowsWithStudentCohorts/);
    });
});
