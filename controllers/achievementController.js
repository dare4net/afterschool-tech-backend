const pool = require('../config/db');

exports.createAchievement = async (req, res) => {
  const { title, type, criteria } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO achievements (title, type, criteria) VALUES (?, ?, ?)',
      [title, type, criteria]
    );
    res.status(201).json({ id: result.insertId, title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.linkAchievementToProgram = async (req, res) => {
  const { achievement_id } = req.body;
  const { programId } = req.params;
  try {
    await pool.query(
      'INSERT INTO program_achievements (program_id, achievement_id) VALUES (?, ?)',
      [programId, achievement_id]
    );
    res.status(201).json({ message: 'Achievement linked to program' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
