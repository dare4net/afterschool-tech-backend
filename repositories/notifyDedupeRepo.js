const { getMainDb } = require('../config/database');

const CLAIMS = 'notify_claims';
const THROTTLES = 'notify_throttles';

async function main() {
    return getMainDb();
}

async function claimOnce(key) {
    const id = String(key || '');
    if (!id) return false;
    try {
        await (await main()).collection(CLAIMS).insertOne({
            _id: id,
            created_at: new Date(),
        });
        return true;
    } catch (err) {
        if (err && err.code === 11000) return false;
        throw err;
    }
}

async function claimThrottle(key, minMs) {
    const id = String(key || '');
    if (!id) return false;
    const now = Date.now();
    const windowMs = Math.max(0, Number(minMs) || 0);
    const col = (await main()).collection(THROTTLES);
    const existing = await col.findOne({ _id: id });
    if (existing && existing.at && (now - new Date(existing.at).getTime()) < windowMs) {
        return false;
    }
    await col.updateOne(
        { _id: id },
        { $set: { at: new Date() } },
        { upsert: true }
    );
    return true;
}

module.exports = {
    CLAIMS,
    THROTTLES,
    claimOnce,
    claimThrottle,
};
