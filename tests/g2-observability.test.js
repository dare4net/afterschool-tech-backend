const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createLogger, sanitize } = require('../helpers/logger');
const { createErrorTracker, parseSentryDsn } = require('../helpers/errorTracker');
const { resolveRequestId, requestIdMiddleware } = require('../middleware/requestId');
const { createHealthHandler } = require('../controllers/healthController');
const { errorHandler, notFoundHandler } = require('../middleware/httpGuards');

function resStub() {
    return {
        statusCode: null,
        body: null,
        headersSent: false,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
    };
}

describe('G2 structured logger', () => {
    it('writes a JSON line with level, msg, and requestId', () => {
        const lines = [];
        const { log } = createLogger({ write: (line) => lines.push(line) });
        log('info', 'http', { requestId: 'req-abc', status: 200 });
        assert.equal(lines.length, 1);
        const parsed = JSON.parse(lines[0]);
        assert.equal(parsed.level, 'info');
        assert.equal(parsed.msg, 'http');
        assert.equal(parsed.requestId, 'req-abc');
        assert.equal(parsed.status, 200);
        assert.equal(typeof parsed.ts, 'string');
    });

    it('does not let fields overwrite level or msg', () => {
        const lines = [];
        const { log } = createLogger({ write: (line) => lines.push(line) });
        log('error', 'health_db_down', { msg: 'socket hang up', requestId: 'req-down' });
        const parsed = JSON.parse(lines[0]);
        assert.equal(parsed.msg, 'health_db_down');
        assert.equal(parsed.level, 'error');
        assert.equal(parsed.requestId, 'req-down');
    });

    it('redacts secrets and mongo URIs', () => {
        const cleaned = sanitize({
            authorization: 'Bearer secret-token',
            password: 'hunter2',
            msg: 'failed mongodb://user:pass@localhost/db',
        });
        assert.equal(cleaned.authorization, '[redacted]');
        assert.equal(cleaned.password, '[redacted]');
        assert.equal(cleaned.msg, 'failed mongodb://[redacted]');
        assert.equal(JSON.stringify(cleaned).includes('hunter2'), false);
        assert.equal(JSON.stringify(cleaned).includes('secret-token'), false);
    });
});

describe('G2 request IDs', () => {
    it('reuses a valid incoming x-request-id and echoes it', () => {
        const incoming = 'client-req-12345';
        assert.equal(resolveRequestId(incoming), incoming);
        const req = { headers: { 'x-request-id': incoming } };
        const res = resStub();
        let nextCalled = false;
        requestIdMiddleware(req, res, () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, true);
        assert.equal(req.requestId, incoming);
        assert.equal(res.headers['x-request-id'], incoming);
    });

    it('rejects unsafe incoming ids and generates a uuid', () => {
        const generated = resolveRequestId('bad id with spaces');
        assert.match(generated, /^[0-9a-f-]{36}$/i);
        assert.equal(resolveRequestId(undefined).length > 8, true);
    });
});

describe('G2 error tracker', () => {
    it('logs exceptions with requestId and does not throw when the reporter fails', async () => {
        const lines = [];
        const { log } = createLogger({ write: (line) => lines.push(line) });
        const reports = [];
        const { captureException } = createErrorTracker({
            log,
            report: async (error, context) => {
                reports.push({ error, context });
                throw new Error('sentry down');
            },
        });
        captureException(new Error('boom'), { requestId: 'req-err', authorization: 'Bearer abc' });
        await new Promise((r) => setImmediate(r));
        const parsed = JSON.parse(lines[0]);
        assert.equal(parsed.msg, 'exception');
        assert.equal(parsed.err, 'boom');
        assert.equal(parsed.requestId, 'req-err');
        assert.equal(parsed.authorization, '[redacted]');
        assert.equal(reports.length, 1);
    });

    it('parses a Sentry DSN into a store URL', () => {
        const parsed = parseSentryDsn('https://abc123@o1.ingest.sentry.io/99');
        assert.equal(parsed.key, 'abc123');
        assert.equal(parsed.url, 'https://o1.ingest.sentry.io/api/99/store/');
    });
});

describe('G2 /health', () => {
    it('returns 200 when the DB ping succeeds', async () => {
        const handler = createHealthHandler({ ping: async () => {} });
        const res = resStub();
        await handler({ requestId: 'req-health' }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { status: 'ok', db: 'ok', requestId: 'req-health' });
    });

    it('returns 503 when the DB ping fails', async () => {
        const handler = createHealthHandler({
            ping: async () => {
                throw new Error('socket hang up');
            },
        });
        const res = resStub();
        await handler({ requestId: 'req-down' }, res);
        assert.equal(res.statusCode, 503);
        assert.deepEqual(res.body, { status: 'unhealthy', db: 'down', requestId: 'req-down' });
    });
});

describe('G2 http error bodies include requestId', () => {
    const previous = process.env.NODE_ENV;

    afterEach(() => {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    });
    it('attaches requestId to 500 responses without leaking the stack', () => {
        process.env.NODE_ENV = 'production';
        const err = new Error('mongodb://secret@localhost/db');
        err.stack = 'Error: mongodb://secret@localhost/db\n    at fake.js:1:1';
        const res = resStub();
        errorHandler(err, { requestId: 'req-500', path: '/api/wallet' }, res, () => {
            throw new Error('should not next');
        });
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Internal server error', requestId: 'req-500' });
        const serialized = JSON.stringify(res.body);
        assert.equal(serialized.includes('secret'), false);
        assert.equal(serialized.includes('fake.js'), false);
    });

    it('attaches requestId to 404', () => {
        const res = resStub();
        notFoundHandler({ requestId: 'req-404' }, res);
        assert.deepEqual(res.body, { error: 'Not found', requestId: 'req-404' });
    });
});

describe('G2 server wiring', () => {
    it('mounts request IDs and /health before the 404 handler', () => {
        const source = readFileSync(join(__dirname, '../server.js'), 'utf8');
        assert.match(source, /requestIdMiddleware/);
        assert.match(source, /requestLogMiddleware/);
        assert.match(source, /app\.get\('\/health',\s*healthHandler\)/);
        const healthAt = source.indexOf("app.get('/health'");
        const notFoundAt = source.indexOf('app.use(notFoundHandler)');
        assert.equal(healthAt > -1 && healthAt < notFoundAt, true);
    });

    it('database.js exports pingDb', () => {
        const source = readFileSync(join(__dirname, '../config/database.js'), 'utf8');
        assert.match(source, /async function pingDb/);
        assert.match(source, /command\(\s*\{\s*ping:\s*1\s*\}\s*\)/);
    });
});
