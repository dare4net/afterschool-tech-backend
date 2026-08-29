const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const authenticate = require('../middleware/authenticate');

router.post('/', authenticate, achievementController.createAchievement);
router.post('/:programId', authenticate, achievementController.linkAchievementToProgram);

module.exports = router;
