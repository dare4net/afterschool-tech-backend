const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { authorize } = require('../middleware/authorize');
const {
    storeSkuBodySchema,
    storeResetBodySchema,
    storeQuoteQuerySchema,
    validateBody,
    validateQuery,
} = require('../contracts/platform');

router.use(authorize);
router.get('/', storeController.getStore);
router.get('/reset-quote', validateQuery(storeQuoteQuerySchema), storeController.quoteReset);
router.post('/buy', validateBody(storeSkuBodySchema), storeController.buy);
router.post('/upgrade', validateBody(storeSkuBodySchema), storeController.upgrade);
router.post('/activate', validateBody(storeSkuBodySchema), storeController.activate);
router.post('/reset-lesson', validateBody(storeResetBodySchema), storeController.resetLesson);

module.exports = router;
