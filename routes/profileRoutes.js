const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const profileController = require('../controllers/profileController');
const { updateProfileBodySchema, publicAccessBodySchema, validateBody } = require('../contracts/platform');

// Get current user's profile
router.get('/', authenticate, profileController.getProfile);

// Update current user's profile
router.put('/', authenticate, validateBody(updateProfileBodySchema), profileController.updateProfile);
router.patch('/public-access', authenticate, validateBody(publicAccessBodySchema), profileController.updatePublicAccess);
router.put('/password', authenticate, profileController.updatePassword);

module.exports = router;
