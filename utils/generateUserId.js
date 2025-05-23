// Generates a unique 5-digit user_id not present in the users table
module.exports = async function generateUserId(pool) {
  let userId;
  let exists = true;
  while (exists) {
    userId = Math.floor(10000 + Math.random() * 90000); // 5-digit number
    const [rows] = await pool.query('SELECT 1 FROM users WHERE user_id = ?', [userId]);
    exists = rows.length > 0;
  }
  return userId;
};
