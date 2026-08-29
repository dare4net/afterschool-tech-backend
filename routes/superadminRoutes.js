const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadminController');
const catalogController = require('../controllers/catalogController');
const { requireSuperadmin } = require('../middleware/superadmin');
const { authLimiter } = require('../middleware/httpGuards');
const loginLimiter = authLimiter();
const {
    validate,
    createMissionSchema,
    updateMissionSchema,
    createAchievementSchema,
    updateAchievementSchema,
} = require('../validators/studioValidators');

router.post('/login', loginLimiter, superadminController.login);

router.use(requireSuperadmin);
router.get('/me', superadminController.me);
router.get('/catalog/meta', catalogController.getMeta);
router.get('/catalog/missions', catalogController.listMissions);
router.post('/catalog/missions', validate(createMissionSchema), catalogController.createMission);
router.put('/catalog/missions/:id', validate(updateMissionSchema), catalogController.updateMission);
router.delete('/catalog/missions/:id', catalogController.deleteMission);
router.get('/catalog/achievements', catalogController.listAchievements);
router.post('/catalog/achievements', validate(createAchievementSchema), catalogController.createAchievement);
router.put('/catalog/achievements/:id', validate(updateAchievementSchema), catalogController.updateAchievement);
router.delete('/catalog/achievements/:id', catalogController.deleteAchievement);

module.exports = router;
