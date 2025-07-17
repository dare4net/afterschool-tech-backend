const { MongoClient } = require('mongodb');

// Generates a unique 5-digit user_id not present in the users collection
module.exports = async function generateUserId() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('afterschooltech');
    const users = db.collection('users');
    
    let userId;
    let exists = true;
    
    while (exists) {
      userId = Math.floor(10000 + Math.random() * 90000); // 5-digit number
      const existingUser = await users.findOne({ user_id: userId });
      exists = existingUser !== null;
    }
    
    return userId;
  } finally {
    await client.close();
  }
};
