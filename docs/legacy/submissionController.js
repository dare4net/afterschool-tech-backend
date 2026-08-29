const pool = require('../config/db');
const { checkAndAwardAchievements } = require('../utils/achievementLogic');

// Student submits a test/evaluation
exports.submit = async (req, res) => {
  const { student_id, curriculum_item_id, score } = req.body;
  try {
    // Insert submission
    await pool.query(
      'INSERT INTO submissions (student_id, curriculum_item_id, score) VALUES (?, ?, ?)',
      [student_id, curriculum_item_id, score]
    );
    // Check and award achievements
    await checkAndAwardAchievements({
      student_id,
      curriculum_item_id,
      score,
      isSubmission: true
    });
    res.status(201).json({ message: 'Submission recorded and achievements checked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
