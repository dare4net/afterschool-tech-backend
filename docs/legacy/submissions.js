const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');

router.post('/', submissionController.submit);

module.exports = router;
