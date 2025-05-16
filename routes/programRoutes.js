const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');
const authenticate = require('../middleware/authenticate');

router.post('/', programController.createProgram);
router.post('/:programId/modules', authenticate, programController.createModule);
router.get('/:programId', authenticate, programController.getProgramDetails);
router.post('/:programId/modules', authenticate, programController.createModule);
router.post('/modules/:moduleId/curriculums', authenticate, programController.addCurriculum);
router.get('/achievements/predefined', authenticate, programController.getPredefinedAchievements);
router.post('/:programId/achievements', authenticate, programController.assignAchievementsToProgram);
router.post('/modules/:moduleId/achievements', authenticate, programController.assignAchievementsToModule);

module.exports = router;


module.exports = router;
