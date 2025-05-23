const pool = require('../config/db');

// Helper: get table name by role
function getTableByRole(role) {
  switch (role) {
    case 'student': return 'students';
    case 'parent': return 'parents';
    case 'organization': return 'organizations';
    case 'tutor': return 'tutors';
    default: return null;
  }
}

// GET /api/profile
exports.getProfile = async (req, res) => {
    console.log('we are getting the profile...');
  const userId = req.user.user_id;
  const role = req.user.role;
  try {
    // Get base user info
    const [users] = await pool.query(
      'SELECT user_id, email, account_type, full_name FROM users WHERE user_id = ?',
      [userId]
    );
    if (!users.length) return res.status(404).json({ message: 'User not found' });

    const user = users[0];
    const table = getTableByRole(role);
    let profile = { ...user };

    // Get role-specific info
    if (table) {
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE user_id = ?`, [user.user_id]);
      if (rows.length) {
        profile = { ...profile, ...rows[0] };
      }
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/profile
exports.updateProfile = async (req, res) => {
  const userId = req.user.user_id;
  const role = req.user.role;
  const { full_name, ...rest } = req.body;

  try {
    // Update base user info
    if (full_name) {
      await pool.query('UPDATE users SET full_name = ? WHERE user_id = ?', [full_name, userId]);
    }

    // Update role-specific info
    const table = getTableByRole(role);
    if (table) {
      // Only update fields that exist in the table
      const [columnsRows] = await pool.query(`SHOW COLUMNS FROM ${table}`);
      const columns = columnsRows.map(col => col.Field).filter(f => f !== 'user_id');
      const updates = [];
      const values = [];
      for (const key of columns) {
        if (rest[key] !== undefined) {
          updates.push(`${key} = ?`);
          values.push(rest[key]);
        }
      }
      if (updates.length) {
        values.push(userId);
        await pool.query(`UPDATE ${table} SET ${updates.join(', ')} WHERE user_id = ?`, values);
      }
    }

    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
