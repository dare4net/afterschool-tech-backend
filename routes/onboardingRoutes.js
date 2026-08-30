const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authorize');
const { completeOnboardingBodySchema, validateBody } = require('../contracts/platform');
const onboardingController = require('../controllers/onboardingController');

router.use(authorize);
router.post('/complete', validateBody(completeOnboardingBodySchema), onboardingController.completeOnboarding);

module.exports = router;
