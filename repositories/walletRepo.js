const { ObjectId } = require('mongodb');
const { getMainDb } = require('../config/database');

async function wallets() {
    const db = await getMainDb();
    return db.collection('student_wallets');
}

async function findByUserId(userId) {
    return (await wallets()).findOne({ user_id: userId });
}

async function insertEmpty(userId) {
    const wallet = {
        user_id: userId,
        starBalance: 0,
        transactions: [],
        created_at: new Date(),
        updated_at: new Date(),
    };
    await (await wallets()).insertOne(wallet);
    return wallet;
}

async function getOrCreate(userId) {
    const existing = await findByUserId(userId);
    if (existing) return existing;
    return insertEmpty(userId);
}

function earnTransaction(amount, reason, componentId) {
    return {
        id: new ObjectId().toString(),
        type: 'earn',
        amount,
        reason,
        componentId: componentId || null,
        at: new Date(),
    };
}

function spendTransaction(amount, itemType) {
    return {
        id: new ObjectId().toString(),
        type: 'spend',
        amount,
        itemType,
        at: new Date(),
    };
}

async function applyBalanceChange(userId, { inc, transaction, upsert = false, awardedComponentId }) {
    const update = {
        $inc: { starBalance: inc },
        $push: { transactions: transaction },
        $set: { updated_at: new Date() },
    };
    if (awardedComponentId) {
        update.$addToSet = { awarded_components: awardedComponentId };
    }
    const result = await (await wallets()).findOneAndUpdate(
        { user_id: userId },
        update,
        { upsert, returnDocument: 'after' }
    );
    return result.value || result;
}

async function hasAwardedComponent(userId, componentId) {
    if (!componentId) return false;
    const wallet = await findByUserId(userId);
    if (!wallet) return false;
    const awarded = Array.isArray(wallet.awarded_components) ? wallet.awarded_components : [];
    if (awarded.includes(componentId)) return true;
    return (wallet.transactions || []).some(
        (row) => row && row.type === 'earn' && row.componentId === componentId
    );
}

module.exports = {
    findByUserId,
    getOrCreate,
    earnTransaction,
    spendTransaction,
    applyBalanceChange,
    hasAwardedComponent,
};
