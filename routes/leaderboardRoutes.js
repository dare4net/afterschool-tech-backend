const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const { authorize } = require('../middleware/authorize');

router.get('/global', leaderboardController.getGlobalLeaderboard);
router.get('/program/:programId', leaderboardController.getProgramLeaderboard);
router.get('/personal', authorize, leaderboardController.getPersonalLeaderboard);

module.exports = router;
