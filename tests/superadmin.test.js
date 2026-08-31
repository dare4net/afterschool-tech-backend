const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const jwt = require('jsonwebtoken');
const {
    credentialsMatch,
    signSuperadminToken,
    verifySuperadminToken,
    TOKEN_TYP,
} = require('../helpers/superadminAuth');
const { requireSuperadmin } = require('../middleware/superadmin');
const superadminController = require('../controllers/superadminController');

const ROOT = join(__dirname, '..');

function mockRes() {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        return res;
    };
    return res;
}

describe('superadmin env credentials', () => {
    const previous = {
        user: process.env.SUPERADMIN_USERNAME,
        pass: process.env.SUPERADMIN_PASSWORD,
        jwt: process.env.JWT_SECRET,
    };

    before(() => {
        process.env.SUPERADMIN_USERNAME = 'console-user';
        process.env.SUPERADMIN_PASSWORD = 'console-pass';
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'superadmin-test-secret';
    });

    after(() => {
        if (previous.user === undefined) delete process.env.SUPERADMIN_USERNAME;
        else process.env.SUPERADMIN_USERNAME = previous.user;
        if (previous.pass === undefined) delete process.env.SUPERADMIN_PASSWORD;
        else process.env.SUPERADMIN_PASSWORD = previous.pass;
        if (previous.jwt === undefined && process.env.JWT_SECRET === 'superadmin-test-secret') {
            delete process.env.JWT_SECRET;
        } else if (previous.jwt !== undefined) {
            process.env.JWT_SECRET = previous.jwt;
        }
    });

    it('does not hardcode a username or password in source', () => {
        const auth = readFileSync(join(ROOT, 'helpers/superadminAuth.js'), 'utf8');
        const controller = readFileSync(join(ROOT, 'controllers/superadminController.js'), 'utf8');
        assert.equal(auth.includes('dami'), false);
        assert.equal(auth.includes('1234'), false);
        assert.equal(controller.includes('dami'), false);
        assert.equal(controller.includes('1234'), false);
        assert.match(auth, /SUPERADMIN_USERNAME/);
        assert.match(auth, /SUPERADMIN_PASSWORD/);
    });

    it('accepts only the env username and password', () => {
        assert.equal(credentialsMatch('console-user', 'console-pass').ok, true);
        assert.equal(credentialsMatch('console-user', 'nope').ok, false);
        assert.equal(credentialsMatch('other', 'console-pass').ok, false);
    });

    it('issues a superadmin token that student authorize cannot confuse with a user', () => {
        const token = signSuperadminToken();
        const decoded = verifySuperadminToken(token);
        assert.equal(decoded.typ, TOKEN_TYP);
        assert.equal(decoded.user_id, undefined);
        assert.equal(verifySuperadminToken('not-a-token'), null);

        const studentToken = jwt.sign({ user_id: 'abc123', role: 'tutor' }, process.env.JWT_SECRET);
        assert.equal(verifySuperadminToken(studentToken), null);
    });

    it('login returns 401 for a bad password and a token for a match', async () => {
        const bad = mockRes();
        await superadminController.login({ body: { username: 'console-user', password: 'wrong' } }, bad);
        assert.equal(bad.statusCode, 401);

        const ok = mockRes();
        await superadminController.login({ body: { username: 'console-user', password: 'console-pass' } }, ok);
        assert.equal(ok.body.success, true);
        assert.equal(typeof ok.body.token, 'string');
    });

    it('requireSuperadmin rejects missing and student tokens', () => {
        const denied = mockRes();
        let nextCalled = false;
        requireSuperadmin({ headers: {} }, denied, () => { nextCalled = true; });
        assert.equal(denied.statusCode, 401);
        assert.equal(nextCalled, false);

        const student = jwt.sign({ user_id: 'abc123', role: 'tutor' }, process.env.JWT_SECRET);
        const deniedStudent = mockRes();
        requireSuperadmin({ headers: { authorization: `Bearer ${student}` } }, deniedStudent, () => { nextCalled = true; });
        assert.equal(deniedStudent.statusCode, 401);

        const allowed = mockRes();
        const req = { headers: { authorization: `Bearer ${signSuperadminToken()}` } };
        requireSuperadmin(req, allowed, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(req.superadmin.role, 'superadmin');
    });
});

describe('superadmin wiring', () => {
    it('mounts /api/superadmin and keeps catalog off tutor studio routes', () => {
        const server = readFileSync(join(ROOT, 'server.js'), 'utf8');
        const studio = readFileSync(join(ROOT, 'routes/studioRoutes.js'), 'utf8');
        const superadmin = readFileSync(join(ROOT, 'routes/superadminRoutes.js'), 'utf8');
        assert.match(server, /app\.use\('\/api\/superadmin'/);
        assert.equal(server.includes("app.use('/api/admin'"), false);
        assert.equal(studio.includes('/catalog/missions'), false);
        assert.match(superadmin, /router\.post\('\/login'/);
        assert.match(superadmin, /requireSuperadmin/);
        assert.match(superadmin, /\/catalog\/missions/);
        assert.match(superadmin, /\/catalog\/achievements/);
        assert.match(superadmin, /\/catalog\/targets/);
        assert.match(superadmin, /\/jobs/);
        assert.match(superadmin, /\/jobs\/:id\/run/);
    });
});
