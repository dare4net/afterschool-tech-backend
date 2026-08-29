const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { notFoundHandler, errorHandler } = require('../middleware/httpGuards');

function resStub() {
    return {
        statusCode: null,
        body: null,
        headersSent: false,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

describe('notFoundHandler', () => {
    it('returns JSON 404', () => {
        const res = resStub();
        notFoundHandler({}, res);
        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { error: 'Not found' });
    });
});

describe('errorHandler', () => {
    const previous = process.env.NODE_ENV;

    afterEach(() => {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    });

    it('does not leak stacks or internal messages in production', () => {
        process.env.NODE_ENV = 'production';
        const err = new Error('mongodb://secret@localhost/db');
        err.stack = 'Error: mongodb://secret@localhost/db\n    at fake.js:1:1';
        const res = resStub();
        errorHandler(err, {}, res, () => {
            throw new Error('should not next');
        });
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Internal server error' });
        const serialized = JSON.stringify(res.body);
        assert.equal(serialized.includes('secret'), false);
        assert.equal(serialized.includes('stack'), false);
        assert.equal(serialized.includes('fake.js'), false);
    });

    it('preserves 4xx messages without a stack field', () => {
        const err = new Error('Apple identity token is required');
        err.status = 400;
        err.stack = 'stack-should-not-appear';
        const res = resStub();
        errorHandler(err, {}, res, () => {});
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'Apple identity token is required');
        assert.equal(res.body.stack, undefined);
    });
});

describe('D3 server wiring', () => {
    it('mounts helmet, auth/wallet rate limits, 404, and error handlers', () => {
        const source = readFileSync(join(__dirname, '../server.js'), 'utf8');
        assert.match(source, /helmet\(/);
        assert.match(source, /authLimiter\(\)/);
        assert.match(source, /walletLimiter\(\)/);
        assert.match(source, /app\.use\('\/api\/auth',\s*authLimiter\(\)/);
        assert.match(source, /app\.use\('\/api\/wallet',\s*walletLimiter\(\)/);
        assert.match(source, /app\.use\(notFoundHandler\)/);
        assert.match(source, /app\.use\(errorHandler\)/);
    });
});
