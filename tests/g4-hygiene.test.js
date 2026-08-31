const { describe, it } = require('node:test');
const assert = require('assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validateBackendEnv } = require('../helpers/env');

const root = join(__dirname, '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

describe('G4 hygiene', () => {
    it('documents required env and validates it on boot', () => {
        assert.equal(existsSync(join(root, '.env.example')), true);
        const example = read('.env.example');
        assert.match(example, /MONGODB_URI=/);
        assert.match(example, /JWT_SECRET=/);
        assert.match(example, /FIREBASE_SERVICE_ACCOUNT=/);
        assert.match(read('README.md'), /IMPLEMENTATION_ORDER.md/);
        assert.match(read('server.js'), /validateBackendEnv\(process\.env\)/);
        assert.match(read('package.json'), /tests\/g4-hygiene\.test\.js/);
    });

    it('rejects bad values and missing secrets outside tests', () => {
        assert.throws(
            () => validateBackendEnv({ SENTRY_DSN: 'not-a-url' }, { requireSecrets: false }),
            /SENTRY_DSN/,
        );
        assert.throws(
            () => validateBackendEnv({ NODE_ENV: 'production' }, { requireSecrets: true }),
            /JWT_SECRET/,
        );
        assert.throws(
            () => validateBackendEnv({
                JWT_SECRET: 'local-dev-secret-value',
            }, { requireSecrets: true }),
            /MONGODB_URI/,
        );

        const parsed = validateBackendEnv({
            JWT_SECRET: 'short',
            MONGODB_URI: 'mongodb://localhost:27017/ast',
            PORT: '5001',
        });
        assert.equal(parsed.PORT, 5001);
        assert.equal(parsed.JWT_SECRET, 'short');
        assert.equal(parsed.MONGODB_URI, 'mongodb://localhost:27017/ast');
    });
});
