const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authorize');
const interactionController = require('../controllers/interactionController');
const {
    interactionGetQuerySchema,
    interactionSaveBodySchema,
    validateBody,
    validateQuery,
} = require('../contracts/platform');

router.use(authorize);
router.get('/', validateQuery(interactionGetQuerySchema), interactionController.getInteraction);
router.post('/', validateBody(interactionSaveBodySchema), interactionController.saveInteraction);

module.exports = router;
