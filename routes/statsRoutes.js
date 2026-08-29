const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authorize } = require('../middleware/authorize');
const { statsEventBodySchema, validateBody } = require('../contracts/platform');

router.use(authorize);

router.get('/summary', statsController.getStudentStats);
router.post('/event', validateBody(statsEventBodySchema), statsController.recordProgressEvent);

module.exports = router;
