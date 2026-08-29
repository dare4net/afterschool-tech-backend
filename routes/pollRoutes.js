const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authorize');
const liveAggregatesController = require('../controllers/liveAggregatesController');
const {
    liveGetQuerySchema,
    pollVoteBodySchema,
    wordCloudAddBodySchema,
    validateBody,
    validateQuery,
} = require('../contracts/platform');

router.use(authorize);
router.get('/', validateQuery(liveGetQuerySchema), liveAggregatesController.getPoll);
router.post('/', validateBody(pollVoteBodySchema), liveAggregatesController.votePoll);

module.exports = router;
