const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const { authorize } = require('../middleware/authorize');
const { claimMissionBodySchema, validateBody } = require('../contracts/platform');

router.use(authorize);
router.get('/catalog', missionController.getCatalog);
router.post('/claim', validateBody(claimMissionBodySchema), missionController.claimMission);

module.exports = router;
