const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const { authorize } = require('../middleware/authorize');

router.use(authorize);
router.post('/up', missionController.levelUp);

module.exports = router;
