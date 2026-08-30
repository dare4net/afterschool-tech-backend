const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authorize');
const liveAggregatesController = require('../controllers/liveAggregatesController');
const {
    liveGetQuerySchema,
    scaleRateBodySchema,
    validateBody,
    validateQuery,
} = require('../contracts/platform');

router.use(authorize);
router.get('/', validateQuery(liveGetQuerySchema), liveAggregatesController.getScale);
router.post('/', validateBody(scaleRateBodySchema), liveAggregatesController.rateScale);

module.exports = router;
