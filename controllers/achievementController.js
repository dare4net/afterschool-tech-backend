const pool = require('../config/db');

exports.createAchievement = async (req, res) => {
  const { title, type, criteria } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO achievements_library (name, type, criteria) VALUES (?, ?, ?)',
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

exports.awardAchievementToStudent = async (req, res) => {
  const { student_id, achievement_id } = req.body;
  try {
    // Prevent duplicate awards
    const [rows] = await pool.query(
      'SELECT id FROM student_achievements WHERE student_id = ? AND achievement_id = ?',
      [student_id, achievement_id]
    );
    if (rows.length > 0) {
      return res.status(409).json({ message: 'Achievement already awarded to student.' });
    }
    await pool.query(
      'INSERT INTO student_achievements (student_id, achievement_id, earned_at) VALUES (?, ?, NOW())',
      [student_id, achievement_id]
    );
    res.status(201).json({ message: 'Achievement awarded to student.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
