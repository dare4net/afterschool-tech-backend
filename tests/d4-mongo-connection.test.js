const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'tests']);

function walkJs(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        const stat = statSync(full);
        if (stat.isDirectory()) walkJs(full, out);
        else if (name.endsWith('.js')) out.push(full);
    }
    return out;
}

describe('D4 one Mongo connection', () => {
    it('MongoClient construction lives only in config/database.js', () => {
        const files = walkJs(ROOT);
        const offenders = files.filter((file) => {
            const rel = relative(ROOT, file).replace(/\\/g, '/');
            if (rel === 'config/database.js') return false;
            const source = readFileSync(file, 'utf8');
            return source.includes('MongoClient') || source.includes('new MongoClient');
        });
        assert.deepEqual(offenders, []);
    });

    it('request-path helpers use getMainDb / getLessonsDb / getBetaDb', () => {
        const generateUserId = readFileSync(join(ROOT, 'utils/generateUserId.js'), 'utf8');
        const profile = readFileSync(join(ROOT, 'controllers/profileController.js'), 'utf8');
        const program = readFileSync(join(ROOT, 'controllers/programController.js'), 'utf8');
        const beta = readFileSync(join(ROOT, 'controllers/betaController.js'), 'utf8');
        assert.match(generateUserId, /getMainDb/);
        assert.match(profile, /getMainDb/);
        assert.match(program, /getMainDb/);
        assert.match(beta, /getBetaDb/);
        assert.equal(generateUserId.includes('client.close()'), false);
    });
});
