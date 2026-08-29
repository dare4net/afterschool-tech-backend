const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authorize');
const liveAggregatesController = require('../controllers/liveAggregatesController');
const {
    liveGetQuerySchema,
    wordCloudAddBodySchema,
    validateBody,
    validateQuery,
} = require('../contracts/platform');

router.use(authorize);
router.get('/', validateQuery(liveGetQuerySchema), liveAggregatesController.getWordCloud);
router.post('/', validateBody(wordCloudAddBodySchema), liveAggregatesController.addWordCloudWord);

module.exports = router;
