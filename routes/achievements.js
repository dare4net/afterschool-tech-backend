const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const {
  Achievement,
  CurriculumAchievement,
  ModuleAchievement,
  CurriculumItem,
  Module,
  Program,
  StudentAchievement
} = require('../models/models');

// Get all achievements
router.get('/', async (req, res) => {
  const achievements = await Achievement.findAll();
  res.json(achievements);
});

// Assign achievement to student
router.post('/assign', async (req, res) => {
  const { student_id, achievement_id } = req.body;
  const sa = await StudentAchievement.create({ student_id, achievement_id });
  res.status(201).json(sa);
});

// Assign achievement to a curriculum item
router.post('/curriculum/:curriculumItemId/assign', async (req, res) => {
  const { achievement_id } = req.body;
  const { curriculumItemId } = req.params;
  const ca = await CurriculumAchievement.create({
    curriculum_item_id: curriculumItemId,
    achievement_id
  });
  res.status(201).json(ca);
});

// Assign achievement to a module
router.post('/module/:moduleId/assign', async (req, res) => {
  const { achievement_id } = req.body;
  const { moduleId } = req.params;
  const ma = await ModuleAchievement.create({
    module_id: moduleId,
    achievement_id
  });
  res.status(201).json(ma);
});

// Get achievements for a curriculum item
router.get('/curriculum/:curriculumItemId', async (req, res) => {
  const { curriculumItemId } = req.params;
  const item = await CurriculumItem.findByPk(curriculumItemId, {
    include: [{ model: Achievement }]
  });
  res.json(item ? item.Achievements : []);
});

// Get achievements for a module
router.get('/module/:moduleId', async (req, res) => {
  const { moduleId } = req.params;
  const module = await Module.findByPk(moduleId, {
    include: [{ model: Achievement }]
  });
  res.json(module ? module.Achievements : []);
});

// Get achievements for a program
router.get('/program/:programId', async (req, res) => {
  const { programId } = req.params;
  const program = await Program.findByPk(programId, {
    include: [{ model: Achievement }]
  });
  res.json(program ? program.Achievements : []);
});

// Award an achievement to a student
router.post('/award', achievementController.awardAchievementToStudent);

module.exports = router;