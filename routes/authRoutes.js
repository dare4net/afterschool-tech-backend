const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/signup', authController.signup);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/login/google', authController.googleLogin);
router.post('/login/facebook', authController.facebookLogin);
router.post('/login/apple', authController.appleLogin);

module.exports = router;
