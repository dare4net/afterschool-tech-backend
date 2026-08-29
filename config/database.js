const { MongoClient } = require('mongodb');
require('dotenv').config();
const { log } = require('../helpers/logger');

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined');
}

const client = new MongoClient(uri);
let isConnected = false;

/**
 * Connect to MongoDB if not already connected
 * @returns {Promise<MongoClient>}
 */
async function connectDB() {
    if (!isConnected) {
        try {
            await client.connect();
            isConnected = true;
            log('info', 'mongo_connected');
        } catch (error) {
            log('error', 'mongo_connect_failed', { msg: error.message });
            throw error;
        }
    }
    return client;
}

/**
 * Get the main database (afterschooltech)
 * @returns {Promise<Db>}
 */
async function getMainDb() {
    await connectDB();
    return client.db('afterschooltech');
}

/**
 * Get the lessons database (ast_lessons)
 * @returns {Promise<Db>}
 */
async function getLessonsDb() {
    await connectDB();
    return client.db('ast_lessons');
}

/**
 * Get the beta-feedback database (ast_beta)
 * @returns {Promise<Db>}
 */
async function getBetaDb() {
    await connectDB();
    return client.db('ast_beta');
}

/**
 * Ping MongoDB so /health can report connectivity.
 */
async function pingDb() {
    await connectDB();
    await client.db('admin').command({ ping: 1 });
}

/**
 * Close database connection gracefully
 */
async function closeDB() {
    if (isConnected) {
        await client.close();
        isConnected = false;
        log('info', 'mongo_closed');
    }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    await closeDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeDB();
    process.exit(0);
});

module.exports = {
    connectDB,
    getMainDb,
    getLessonsDb,
    getBetaDb,
    pingDb,
    closeDB,
    client
};
