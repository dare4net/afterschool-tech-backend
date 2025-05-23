const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const profileController = require('../controllers/profileController');

// Get current user's profile
router.get('/', authenticate, profileController.getProfile);

// Update current user's profile
router.put('/', authenticate, profileController.updateProfile);

module.exports = router;
