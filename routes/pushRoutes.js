const express = require('express');
const router = express.Router();
const pushController = require('../controllers/pushController');
const { authorize } = require('../middleware/authorize');
const { pushTokenBodySchema, validateBody } = require('../contracts/platform');

router.use(authorize);
router.post('/tokens', validateBody(pushTokenBodySchema), pushController.registerToken);
router.delete('/tokens', validateBody(pushTokenBodySchema), pushController.removeToken);

module.exports = router;
