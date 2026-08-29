const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const { authorize } = require('../middleware/authorize');

router.use(authorize);
router.get('/student', achievementController.getStudentAchievements);
router.post('/evaluate', achievementController.evaluateEvent);

module.exports = router;
