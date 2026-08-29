const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const LEGACY = join(ROOT, 'docs/legacy');

const UNMOUNTED_ROUTES = [
    'routes/achievementRoutes.js',
    'routes/programs.js',
    'routes/modules.js',
    'routes/curriculum.js',
    'routes/curriculumStarts.js',
    'routes/submissions.js',
    'routes/index.js',
    'routes/achievements.js',
];

const DEAD_CONTROLLERS = [
    'controllers/programController_old.js',
    'controllers/submissionController.js',
    'controllers/curriculumStartController.js',
];

describe('D8 unmounted dead weight is quarantined', () => {
    it('server.js does not mount the MySQL/unmounted route files', () => {
        const server = readFileSync(join(ROOT, 'server.js'), 'utf8');
        assert.equal(server.includes("require('./routes/achievementRoutes')"), false);
        assert.equal(server.includes("require('./routes/programs')"), false);
        assert.equal(server.includes("require('./routes/modules')"), false);
        assert.equal(server.includes("require('./routes/curriculum')"), false);
        assert.equal(server.includes("require('./routes/curriculumStarts')"), false);
        assert.equal(server.includes("require('./routes/submissions')"), false);
        assert.equal(server.includes("require('./routes/index')"), false);
        assert.match(server, /app\.use\('\/api\/programs',\s*programRoutes\)/);
    });

    it('unmounted route files and dead MySQL controllers are gone from live paths', () => {
        for (const file of [...UNMOUNTED_ROUTES, ...DEAD_CONTROLLERS]) {
            assert.equal(existsSync(join(ROOT, file)), false, file);
        }
        assert.equal(existsSync(join(ROOT, 'utils/achievementLogic.js')), false);
        assert.equal(existsSync(join(ROOT, 'config/afterschooltech.sql')), false);
        assert.equal(existsSync(join(ROOT, 'config/afterschooltech_structure.sql')), false);
    });

    it('quarantines them under docs/legacy', () => {
        const expected = [
            'routes-achievements.js',
            'achievementRoutes.js',
            'programs.js',
            'modules.js',
            'curriculum.js',
            'curriculumStarts.js',
            'submissions.js',
            'routes-index.js',
            'programController_old.js',
            'submissionController.js',
            'curriculumStartController.js',
            'achievementLogic.js',
            'afterschooltech.sql',
            'afterschooltech_structure.sql',
        ];
        for (const name of expected) {
            assert.equal(existsSync(join(LEGACY, name)), true, name);
        }
    });
});
