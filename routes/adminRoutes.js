const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticate = require('../middleware/authenticate');

// User Management
router.get('/users', authenticate, adminController.getAllUsers);
router.get('/users/:userId', authenticate, adminController.getUserById);
router.put('/users/:userId', authenticate, adminController.updateUser);
router.delete('/users/:userId', authenticate, adminController.deleteUser);

// Student Management
router.get('/students', authenticate, adminController.getAllStudents);
router.get('/students/:studentId', authenticate, adminController.getStudentById);
router.post('/students', authenticate, adminController.createStudent);
router.put('/students/:studentId', authenticate, adminController.updateStudent);
router.delete('/students/:studentId', authenticate, adminController.deleteStudent);

// Program Management
router.get('/programs', authenticate, adminController.getAllPrograms);
router.get('/programs/:programId', authenticate, adminController.getProgramById);
router.post('/programs', authenticate, adminController.createProgram);
router.put('/programs/:programId', authenticate, adminController.updateProgram);
router.delete('/programs/:programId', authenticate, adminController.deleteProgram);

// Module Management
router.get('/modules', authenticate, adminController.getAllModules);
router.get('/modules/:moduleId', authenticate, adminController.getModuleById);
router.post('/modules', authenticate, adminController.createModule);
router.put('/modules/:moduleId', authenticate, adminController.updateModule);
router.delete('/modules/:moduleId', authenticate, adminController.deleteModule);

// Achievement Management
router.get('/achievements', authenticate, adminController.getAllAchievements);
router.get('/achievements/:achievementId', authenticate, adminController.getAchievementById);
router.post('/achievements', authenticate, adminController.createAchievement);
router.put('/achievements/:achievementId', authenticate, adminController.updateAchievement);
router.delete('/achievements/:achievementId', authenticate, adminController.deleteAchievement);

module.exports = router;
