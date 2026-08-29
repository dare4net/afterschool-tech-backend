const pool = require('../config/db');
const { checkAndAwardAchievements } = require('../utils/achievementLogic');

// Student starts a curriculum item
exports.start = async (req, res) => {
  const { student_id, curriculum_item_id } = req.body;
  try {
    // Insert start record
    await pool.query(
      'INSERT INTO curriculum_starts (student_id, curriculum_item_id) VALUES (?, ?)',
      [student_id, curriculum_item_id]
    );
    // Check and award achievements
    await checkAndAwardAchievements({
      student_id,
      curriculum_item_id,
      isStart: true
    });
    res.status(201).json({ message: 'Start recorded and achievements checked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
