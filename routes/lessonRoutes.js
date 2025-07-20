const express = require('express');
const router = express.Router();
const { authorize, authorizeRole } = require('../middleware/authorize');
const lessonController = require('../controllers/lessonController');

// Public routes - none for lessons, all require auth

// Student routes
router.get('/my/interactions/:userId', authorize, lessonController.getAllLessonsByUser);
router.get('/my/cached-lessons', authorize, lessonController.getCachedLessonsByUser);
router.get('/module/:moduleId/lessons', authorize, lessonController.getModuleLessons);
router.get('/completed', authorize, lessonController.getCompletedLessons);
router.get('/:lessonId', authorize, lessonController.getLessonDetails);
router.post('/:lessonId/complete', authorize, lessonController.markLessonCompleted);

// Admin/Teacher routes
router.post('/module/:moduleId/lessons', authorize, authorizeRole('admin', 'teacher'), lessonController.createLesson);
router.put('/:lessonId', authorize, authorizeRole('admin', 'teacher'), lessonController.updateLesson);

module.exports = router;
