const express = require('express');
const router = express.Router();
const curriculumStartController = require('../controllers/curriculumStartController');

router.post('/', curriculumStartController.start);

module.exports = router;
