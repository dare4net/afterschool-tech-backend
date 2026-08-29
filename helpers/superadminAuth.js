const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const TOKEN_TYP = 'superadmin';

function digest(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function safeEqual(left, right) {
    const a = digest(left);
    const b = digest(right);
    return crypto.timingSafeEqual(a, b) && String(left).length === String(right).length;
}

function getCredentials() {
    const username = process.env.SUPERADMIN_USERNAME;
    const password = process.env.SUPERADMIN_PASSWORD;
    if (!username || !password) return null;
    return { username, password };
}

function credentialsMatch(username, password) {
    const expected = getCredentials();
    if (!expected) return { configured: false, ok: false };
    const userOk = safeEqual(username || '', expected.username);
    const passOk = safeEqual(password || '', expected.password);
    return { configured: true, ok: userOk && passOk };
}

function signSuperadminToken() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET must be set');
    }
    const expected = getCredentials();
    return jwt.sign(
        {
            typ: TOKEN_TYP,
            role: 'superadmin',
            username: expected ? expected.username : 'superadmin',
        },
        secret,
        { expiresIn: '8h', subject: 'env-superadmin' }
    );
}

function verifySuperadminToken(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    try {
        const decoded = jwt.verify(token, secret);
        if (!decoded || decoded.typ !== TOKEN_TYP || decoded.role !== 'superadmin') {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

module.exports = {
    TOKEN_TYP,
    getCredentials,
    credentialsMatch,
    signSuperadminToken,
    verifySuperadminToken,
};
