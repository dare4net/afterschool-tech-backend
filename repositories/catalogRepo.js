const { getMainDb } = require('../config/database');

const MISSIONS = 'platform_missions';
const ACHIEVEMENTS = 'platform_achievements';

async function missionsCol() {
    return (await getMainDb()).collection(MISSIONS);
}

async function achievementsCol() {
    return (await getMainDb()).collection(ACHIEVEMENTS);
}

async function ensureIndexes() {
    const missions = await missionsCol();
    const achievements = await achievementsCol();
    await missions.createIndex({ id: 1 }, { unique: true });
    await achievements.createIndex({ id: 1 }, { unique: true });
}

async function seedIfMissing(colFn, docs) {
    const col = await colFn();
    for (const doc of docs) {
        await col.updateOne(
            { id: doc.id },
            { $setOnInsert: { ...doc, created_at: new Date(), updated_at: new Date() } },
            { upsert: true }
        );
    }
}

async function listMissions(filter = {}) {
    return (await missionsCol()).find(filter).sort({ level: 1, id: 1 }).toArray();
}

async function findMission(id) {
    return (await missionsCol()).findOne({ id });
}

async function insertMission(doc) {
    const now = new Date();
    const record = { ...doc, created_at: now, updated_at: now };
    await (await missionsCol()).insertOne(record);
    return record;
}

async function updateMission(id, patch) {
    return (await missionsCol()).findOneAndUpdate(
        { id },
        { $set: { ...patch, updated_at: new Date() } },
        { returnDocument: 'after' }
    );
}

async function deleteMission(id) {
    return (await missionsCol()).deleteOne({ id });
}

async function listAchievements(filter = {}) {
    return (await achievementsCol()).find(filter).sort({ id: 1 }).toArray();
}

async function findAchievement(id) {
    return (await achievementsCol()).findOne({ id });
}

async function insertAchievement(doc) {
    const now = new Date();
    const record = { ...doc, created_at: now, updated_at: now };
    await (await achievementsCol()).insertOne(record);
    return record;
}

async function updateAchievement(id, patch) {
    return (await achievementsCol()).findOneAndUpdate(
        { id },
        { $set: { ...patch, updated_at: new Date() } },
        { returnDocument: 'after' }
    );
}

async function deleteAchievement(id) {
    return (await achievementsCol()).deleteOne({ id });
}

module.exports = {
    MISSIONS,
    ACHIEVEMENTS,
    ensureIndexes,
    seedIfMissing,
    missionsCol,
    achievementsCol,
    listMissions,
    findMission,
    insertMission,
    updateMission,
    deleteMission,
    listAchievements,
    findAchievement,
    insertAchievement,
    updateAchievement,
    deleteAchievement,
};
