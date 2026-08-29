const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const APPLE_ISS = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

async function fetchAppleJwks() {
    const { data } = await axios.get(APPLE_JWKS_URL, { timeout: 10000 });
    return data;
}

/**
 * Verify an Apple identity token (JWT) against Apple's JWKS.
 * Rejects tokens that are only decoded, not signature-checked.
 */
async function verifyAppleIdToken(idToken, {
    audience = process.env.APPLE_CLIENT_ID,
    fetchJwks = fetchAppleJwks,
} = {}) {
    if (!idToken || typeof idToken !== 'string') {
        const err = new Error('Apple identity token is required');
        err.status = 400;
        throw err;
    }
    if (!audience) {
        const err = new Error('APPLE_CLIENT_ID must be set');
        err.status = 500;
        throw err;
    }

    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header || !decoded.payload) {
        const err = new Error('Invalid Apple token');
        err.status = 400;
        throw err;
    }

    const kid = decoded.header.kid;
    const jwks = await fetchJwks();
    const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((k) => k.kid === kid) : null;
    if (!jwk) {
        const err = new Error('Unknown Apple signing key');
        err.status = 401;
        throw err;
    }

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    try {
        return jwt.verify(idToken, publicKey, {
            algorithms: ['RS256'],
            issuer: APPLE_ISS,
            audience,
        });
    } catch (verifyErr) {
        const err = new Error('Invalid Apple token');
        err.status = 401;
        err.cause = verifyErr;
        throw err;
    }
}

module.exports = { verifyAppleIdToken, APPLE_ISS, APPLE_JWKS_URL };
