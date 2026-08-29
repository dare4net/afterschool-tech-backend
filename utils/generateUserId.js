const { getMainDb } = require('../config/database');

// Generates a unique 6-character user_id not present in the users collection
module.exports = async function generateUserId() {
  const db = await getMainDb();
  const users = db.collection('users');

  const characters = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ...'abcdefghijklmnopqrstuvwxyz',
    ...'0123456789'
  ];

  let userId;
  let exists = true;

  while (exists) {
    userId = Array(6).fill()
      .map(() => characters[Math.floor(Math.random() * characters.length)])
      .join('');

    const existingUser = await users.findOne({ user_id: userId });
    exists = existingUser !== null;
  }

  return userId;
};
