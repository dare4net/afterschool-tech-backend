const express = require('express');
const router = express.Router();
const prideController = require('../controllers/prideController');
const { optionalAuthorize } = require('../middleware/authorize');

router.get('/', optionalAuthorize, prideController.listPride);
router.get('/:statKey', optionalAuthorize, prideController.getBoard);

module.exports = router;
