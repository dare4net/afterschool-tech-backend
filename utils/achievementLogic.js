const {
  CurriculumAchievement,
  Achievement,
  StudentAchievement
} = require('../models/models');
const pool = require('../config/db');

// Helper to check if achievement already awarded
async function alreadyAwarded(student_id, achievement_id) {
  const [rows] = await pool.query(
    'SELECT id FROM student_achievements WHERE student_id = ? AND achievement_id = ?',
    [student_id, achievement_id]
  );
  return rows.length > 0;
}

// Main function to check and award achievements
async function checkAndAwardAchievements({ student_id, curriculum_item_id, score = null, isSubmission = false, isStart = false }) {
  // Get all achievements linked to this curriculum item
  const achievements = await CurriculumAchievement.findAll({
    where: { curriculum_item_id },
    include: [{ model: Achievement }]
  });

  for (const ca of achievements) {
    const achievement = ca.Achievement;
    if (!achievement) continue;
    const criteria = achievement.criteria;

    // "score >= 80"
    if (criteria.startsWith('score >=') && score !== null) {
      const threshold = parseFloat(criteria.split('>=')[1].trim());
      if (score >= threshold && !(await alreadyAwarded(student_id, achievement.id))) {
        await StudentAchievement.create({ student_id, achievement_id: achievement.id, earned_at: new Date() });
      }
    }

    // "highest_score"
    if (criteria === 'highest_score' && score !== null) {
      // Find the highest score for this curriculum item
      const [rows] = await pool.query(
        'SELECT student_id, MAX(score) as max_score FROM submissions WHERE curriculum_item_id = ? GROUP BY student_id ORDER BY max_score DESC LIMIT 1',
        [curriculum_item_id]
      );
      if (rows.length > 0 && rows[0].student_id === student_id && !(await alreadyAwarded(student_id, achievement.id))) {
        await StudentAchievement.create({ student_id, achievement_id: achievement.id, earned_at: new Date() });
      }
    }

    // "first_submission"
    if (criteria === 'first_submission' && isSubmission) {
      const [rows] = await pool.query(
        'SELECT student_id FROM submissions WHERE curriculum_item_id = ? ORDER BY submitted_at ASC LIMIT 1',
        [curriculum_item_id]
      );
      if (rows.length > 0 && rows[0].student_id === student_id && !(await alreadyAwarded(student_id, achievement.id))) {
        await StudentAchievement.create({ student_id, achievement_id: achievement.id, earned_at: new Date() });
      }
    }

    // "first_to_start"
    if (criteria === 'first_to_start' && isStart) {
      const [rows] = await pool.query(
        'SELECT student_id FROM curriculum_starts WHERE curriculum_item_id = ? ORDER BY started_at ASC LIMIT 1',
        [curriculum_item_id]
      );
      if (rows.length > 0 && rows[0].student_id === student_id && !(await alreadyAwarded(student_id, achievement.id))) {
        await StudentAchievement.create({ student_id, achievement_id: achievement.id, earned_at: new Date() });
      }
    }
  }
}

module.exports = { checkAndAwardAchievements };
