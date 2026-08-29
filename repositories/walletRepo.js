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

async function applyBalanceChange(userId, { inc, transaction, upsert = false }) {
    const result = await (await wallets()).findOneAndUpdate(
        { user_id: userId },
        {
            $inc: { starBalance: inc },
            $push: { transactions: transaction },
            $set: { updated_at: new Date() },
        },
        { upsert, returnDocument: 'after' }
    );
    return result.value || result;
}

module.exports = {
    findByUserId,
    getOrCreate,
    earnTransaction,
    spendTransaction,
    applyBalanceChange,
};
