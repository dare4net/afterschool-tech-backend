const { MongoClient } = require('mongodb');

// Generates a unique 6-character user_id not present in the users collection
module.exports = async function generateUserId() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('afterschooltech');
    const users = db.collection('users');
    
    // Create array of all possible characters
    const characters = [
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      ...'abcdefghijklmnopqrstuvwxyz',
      ...'0123456789'
    ];
    
    let userId;
    let exists = true;
    
    while (exists) {
      // Generate 6 random characters
      userId = Array(6).fill()
        .map(() => characters[Math.floor(Math.random() * characters.length)])
        .join('');
      
      const existingUser = await users.findOne({ user_id: userId });
      exists = existingUser !== null;
    }
    
    return userId;
  } finally {
    await client.close();
  }
};