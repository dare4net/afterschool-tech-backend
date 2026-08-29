const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { generateKeyPairSync } = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyAppleIdToken, APPLE_ISS } = require('../helpers/appleIdToken');
const {
    issueAuthToken,
    ensureCanonicalUserId,
    findOrCreateSocialUser,
} = require('../helpers/authIdentity');
const database = require('../config/database');
const { authorize } = require('../middleware/authorize');
const authenticate = require('../middleware/authenticate');

function mockUsersDb({ existing = null, insertedId = 'oid-1' } = {}) {
    const calls = { findOne: [], insertOne: [], updateOne: [], studentsInsert: [] };
    const users = {
        async findOne(query) {
            calls.findOne.push(query);
            if (!existing) return null;
            if (query.email && existing.email === query.email) return { ...existing };
            if (query.apple_sub && existing.apple_sub === query.apple_sub) return { ...existing };
            if (query.facebook_id && existing.facebook_id === query.facebook_id) return { ...existing };
            if (query.user_id && existing.user_id === query.user_id) return { ...existing };
            return null;
        },
        async insertOne(doc) {
            calls.insertOne.push(doc);
            return { insertedId };
        },
        async updateOne(filter, update) {
            calls.updateOne.push({ filter, update });
            return { modifiedCount: 1 };
        },
    };
    const students = {
        async insertOne(doc) {
            calls.studentsInsert.push(doc);
            return { insertedId: 'stu-1' };
        },
    };
    return {
        calls,
        db: {
            collection(name) {
                if (name === 'users') return users;
                if (name === 'students') return students;
                throw new Error(`unexpected collection ${name}`);
            },
        },
    };
}

describe('authenticate aliases authorize', () => {
    it('exports the same middleware function', () => {
        assert.equal(authenticate, authorize);
    });
});

describe('issueAuthToken', () => {
    const previous = process.env.JWT_SECRET;

    beforeEach(() => {
        process.env.JWT_SECRET = 'd1-test-secret';
    });

    afterEach(() => {
        if (previous === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previous;
    });

    it('signs the 6-character user_id, not Mongo _id', () => {
        const token = issueAuthToken({
            user_id: 'Ab12Cd',
            _id: { toString: () => 'aaaaaaaaaaaaaaaaaaaaaaaa' },
            account_type: 'student',
        });
        const decoded = jwt.verify(token, 'd1-test-secret');
        assert.equal(decoded.user_id, 'Ab12Cd');
        assert.equal(decoded.role, 'student');
        assert.notEqual(decoded.user_id, 'aaaaaaaaaaaaaaaaaaaaaaaa');
        assert.equal(decoded.user_id.length, 6);
    });

    it('refuses to issue a token without user_id', () => {
        assert.throws(
            () => issueAuthToken({ _id: { toString: () => 'aaaaaaaaaaaaaaaaaaaaaaaa' } }),
            /user_id/
        );
    });
});

describe('findOrCreateSocialUser', () => {
    it('creates new social users with a 6-character user_id and student role', async () => {
        const { db, calls } = mockUsersDb();
        const user = await findOrCreateSocialUser(
            db,
            { email: 'kid@example.com', full_name: 'Kid', facebook_id: 'fb-9' },
            { generateId: async () => 'Xy9Kp2' }
        );
        assert.equal(user.user_id, 'Xy9Kp2');
        assert.equal(user.account_type, 'student');
        assert.equal(calls.insertOne[0].user_id, 'Xy9Kp2');
        assert.equal(calls.studentsInsert.length, 1);
        assert.equal(calls.studentsInsert[0].user_id, 'Xy9Kp2');
    });

    it('backfills user_id on legacy social rows that only had Mongo _id', async () => {
        const { db, calls } = mockUsersDb({
            existing: {
                _id: 'oid-legacy',
                email: 'legacy@example.com',
                account_type: 'user',
            },
        });
        const user = await findOrCreateSocialUser(
            db,
            { email: 'legacy@example.com', facebook_id: 'fb-1' },
            { generateId: async () => 'NewId1' }
        );
        assert.equal(user.user_id, 'NewId1');
        assert.equal(calls.updateOne.some((c) => c.update.$set.user_id === 'NewId1'), true);
    });

    it('keeps an existing 6-character user_id', async () => {
        const { db, calls } = mockUsersDb({
            existing: {
                _id: 'oid',
                user_id: 'KeepMe',
                email: 'keep@example.com',
                account_type: 'student',
            },
        });
        const user = await findOrCreateSocialUser(
            db,
            { email: 'keep@example.com' },
            { generateId: async () => 'XXXXXX' }
        );
        assert.equal(user.user_id, 'KeepMe');
        assert.equal(calls.updateOne.some((c) => c.update.$set && c.update.$set.user_id), false);
    });

    it('finds returning Apple users by apple_sub when email is hidden', async () => {
        const { db } = mockUsersDb({
            existing: {
                _id: 'oid',
                user_id: 'ApId01',
                apple_sub: 'apple.sub.9',
                account_type: 'student',
            },
        });
        const user = await findOrCreateSocialUser(db, { apple_sub: 'apple.sub.9' });
        assert.equal(user.user_id, 'ApId01');
    });

    it('rejects a new social account with no email', async () => {
        const { db } = mockUsersDb();
        await assert.rejects(
            () => findOrCreateSocialUser(db, { apple_sub: 'new.sub' }),
            /no email/
        );
    });
});

describe('ensureCanonicalUserId', () => {
    it('does not rewrite a user that already has user_id', async () => {
        const { db, calls } = mockUsersDb();
        const user = await ensureCanonicalUserId(db, { _id: 'x', user_id: 'Abc123' });
        assert.equal(user.user_id, 'Abc123');
        assert.equal(calls.updateOne.length, 0);
    });
});

describe('verifyAppleIdToken', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    jwk.kid = 'test-kid';
    jwk.use = 'sig';
    jwk.alg = 'RS256';

    function signApple(payload, { audience = 'com.ast.test', kid = 'test-kid' } = {}) {
        return jwt.sign(payload, privateKey, {
            algorithm: 'RS256',
            issuer: APPLE_ISS,
            audience,
            expiresIn: '1h',
            header: { kid, alg: 'RS256' },
        });
    }

    it('accepts a token signed with Apple JWKS RS256', async () => {
        const token = signApple({ email: 'kid@example.com', sub: 'apple.sub.1' });
        const payload = await verifyAppleIdToken(token, {
            audience: 'com.ast.test',
            fetchJwks: async () => ({ keys: [jwk] }),
        });
        assert.equal(payload.email, 'kid@example.com');
        assert.equal(payload.sub, 'apple.sub.1');
    });

    it('rejects a token that is only decoded, not signature-checked', async () => {
        const unsigned = jwt.sign(
            { email: 'forged@example.com', sub: 'forged' },
            'not-apple',
            { algorithm: 'HS256', issuer: APPLE_ISS, audience: 'com.ast.test' }
        );
        await assert.rejects(
            () => verifyAppleIdToken(unsigned, {
                audience: 'com.ast.test',
                fetchJwks: async () => ({ keys: [jwk] }),
            }),
            /Invalid Apple token|Unknown Apple signing key/
        );
    });

    it('rejects a tampered payload', async () => {
        const token = signApple({ email: 'kid@example.com', sub: 'apple.sub.1' });
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        payload.email = 'attacker@example.com';
        parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const tampered = parts.join('.');
        await assert.rejects(
            () => verifyAppleIdToken(tampered, {
                audience: 'com.ast.test',
                fetchJwks: async () => ({ keys: [jwk] }),
            }),
            /Invalid Apple token/
        );
    });

    it('rejects the wrong audience', async () => {
        const token = signApple({ email: 'kid@example.com', sub: 's' }, { audience: 'com.other' });
        await assert.rejects(
            () => verifyAppleIdToken(token, {
                audience: 'com.ast.test',
                fetchJwks: async () => ({ keys: [jwk] }),
            }),
            /Invalid Apple token/
        );
    });
});

describe('authorize', () => {
    const previous = process.env.JWT_SECRET;

    beforeEach(() => {
        process.env.JWT_SECRET = 'd1-authz-secret';
    });

    afterEach(() => {
        mock.restoreAll();
        if (previous === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previous;
    });

    function resStub() {
        return {
            statusCode: null,
            body: null,
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

    it('attaches canonical req.user from Mongo user_id, not JWT-only decode', async () => {
        mock.method(database, 'getMainDb', async () => ({
            collection() {
                return {
                    async findOne(query) {
                        assert.equal(query.user_id, 'Ab12Cd');
                        return {
                            _id: 'mongo-oid',
                            user_id: 'Ab12Cd',
                            email: 'ada@example.com',
                            account_type: 'tutor',
                            full_name: 'Ada',
                            password_hash: 'secret-hash',
                        };
                    },
                };
            },
        }));
        const token = jwt.sign({ user_id: 'Ab12Cd', role: 'student' }, 'd1-authz-secret');
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = resStub();
        let nextCalled = false;
        await authorize(req, res, () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, true);
        assert.equal(req.user.user_id, 'Ab12Cd');
        assert.equal(req.user.role, 'tutor');
        assert.equal(req.user.email, 'ada@example.com');
        assert.equal(req.user.password_hash, undefined);
    });

    it('rejects a social-style ObjectId user_id that is not in users.user_id', async () => {
        mock.method(database, 'getMainDb', async () => ({
            collection() {
                return {
                    async findOne() {
                        return null;
                    },
                };
            },
        }));
        const token = jwt.sign(
            { user_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'user' },
            'd1-authz-secret'
        );
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = resStub();
        await authorize(req, res, () => {
            throw new Error('should not next');
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.message, 'User not found');
    });

    it('returns 401 when no bearer token is sent', async () => {
        const req = { headers: {} };
        const res = resStub();
        await authorize(req, res, () => {
            throw new Error('should not next');
        });
        assert.equal(res.statusCode, 401);
    });
});

describe('D1 source contracts', () => {
    it('authorize looks up users via getMainDb, not a private MongoClient', () => {
        const source = readFileSync(join(__dirname, '../middleware/authorize.js'), 'utf8');
        assert.match(source, /getMainDb/);
        assert.equal(source.includes('MongoClient'), false);
        assert.match(source, /user_id: decoded\.user_id/);
        assert.match(source, /role: user\.account_type/);
    });

    it('authenticate re-exports authorize', () => {
        const source = readFileSync(join(__dirname, '../middleware/authenticate.js'), 'utf8');
        assert.match(source, /require\('\.\/authorize'\)/);
        assert.equal(source.includes('jwt.decode'), false);
        assert.equal(source.includes('req.user = decoded'), false);
    });

    it('Apple login verifies signatures; social JWT uses canonical user_id', () => {
        const source = readFileSync(join(__dirname, '../controllers/authController.js'), 'utf8');
        assert.match(source, /verifyAppleIdToken/);
        assert.match(source, /findOrCreateSocialUser/);
        assert.match(source, /issueAuthToken/);
        assert.equal(source.includes('jwt.decode'), false);
        assert.equal(source.includes('_id.toString()'), false);
        assert.equal(source.includes("account_type: 'user'"), false);
    });
});
