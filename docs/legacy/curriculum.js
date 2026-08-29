const express = require('express');
const router = express.Router();
const { CurriculumItem } = require('../models/models');
const { checkAndAwardAchievements } = require('../utils/achievementLogic');

// Get all curriculum items for a module
router.get('/module/:moduleId', async (req, res) => {
  const items = await CurriculumItem.findAll({ where: { module_id: req.params.moduleId } });
  res.json(items);
});

// Create a new curriculum item (admin/tutor only)
router.post('/', async (req, res) => {
  // ...authorization middleware...
  const item = await CurriculumItem.create(req.body);
  res.status(201).json(item);
});

// Sample test endpoint: student submits a score for a curriculum item
router.post('/:curriculumItemId/submit', async (req, res) => {
  const { student_id, score } = req.body;
  const { curriculumItemId } = req.params;

  // Simulate saving submission (replace with actual DB insert as needed)
  // await pool.query('INSERT INTO submissions (student_id, curriculum_item_id, score, submitted_at) VALUES (?, ?, ?, NOW())', [student_id, curriculumItemId, score]);

  // Call achievement logic
  await checkAndAwardAchievements({
    student_id,
    curriculum_item_id: curriculumItemId,
    score,
    isSubmission: true
  });

  res.json({ message: 'Submission received and achievements checked.' });
});

module.exports = router;