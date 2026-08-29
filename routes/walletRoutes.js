const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authorize } = require('../middleware/authorize');
const { awardStarsBodySchema, spendStarsBodySchema, validateBody } = require('../contracts/platform');

router.use(authorize);

router.get('/', walletController.getWallet);
router.post('/award', validateBody(awardStarsBodySchema), walletController.awardStars);
router.post('/spend', validateBody(spendStarsBodySchema), walletController.spendStars);

module.exports = router;
