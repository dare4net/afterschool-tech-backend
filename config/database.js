const { MongoClient } = require('mongodb');
require('dotenv').config();

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
            console.log('✅ Connected to MongoDB');
        } catch (error) {
            console.error('❌ MongoDB connection failed:', error);
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
 * Close database connection gracefully
 */
async function closeDB() {
    if (isConnected) {
        await client.close();
        isConnected = false;
        console.log('MongoDB connection closed');
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
    closeDB,
    client
};
