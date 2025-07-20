const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authorize');
const betaController = require('../controllers/betaController');

// Beta feedback routes - all routes require authentication
router.post('/feedback', authorize, betaController.submitFeedback);
router.get('/feedback', authorize, betaController.getUserFeedbacks);

module.exports = router;
