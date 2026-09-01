const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const studioController = require('../controllers/studioController');
const { isStudioRole } = require('../helpers/studioAccess');
const { validate, createProgramSchema, updateProgramSchema, createModuleSchema, updateModuleSchema, createLessonSchema, updateLessonSchema } = require('../validators/studioValidators');

const requireStudioAccess = (req, res, next) => {
    if (req.user && isStudioRole(req.user.role)) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Studio access required.' });
    }
};

// Apply authentication and studio access to all studio routes
router.use(authenticate);
router.use(requireStudioAccess);

// ===========================
// ANALYTICS & ACTIVITY
// ===========================
router.get('/stats', studioController.getStudioStats);
router.get('/activity', studioController.getStudioActivity);
router.get('/students', studioController.getStudioStudents);
router.get('/students/:id', studioController.getStudioStudentDetail);
router.get('/students/:id/programs/:programId', studioController.getStudioStudentProgramBreakdown);
router.post('/students/:studentId/lessons/:lessonId/components/:componentId/mark', studioController.markStudentResponse);
router.post('/students/:studentId/lessons/:lessonId/components/:componentId/reset', studioController.resetStudentComponentResponse);

// ===========================
// PROGRAM ROUTES
// ===========================
router.post('/programs', validate(createProgramSchema), studioController.createProgram);
router.get('/programs', studioController.getPrograms);
router.get('/programs/:id', studioController.getProgram);
router.put('/programs/:id', validate(updateProgramSchema), studioController.updateProgram);
router.delete('/programs/:id', studioController.deleteProgram);

// ===========================
// MODULE ROUTES
// ===========================
router.post('/programs/:programId/modules', validate(createModuleSchema), studioController.createModule);
router.get('/programs/:programId/modules', studioController.getModules);
router.get('/modules/:id', studioController.getModule);
router.put('/modules/:id', validate(updateModuleSchema), studioController.updateModule);
router.delete('/modules/:id', studioController.deleteModule);

// ===========================
// LESSON ROUTES
// ===========================
router.post('/modules/:moduleId/lessons', validate(createLessonSchema), studioController.createLesson);
router.get('/modules/:moduleId/lessons', studioController.getLessons);
router.get('/lessons/:id', studioController.getLesson);
router.put('/lessons/:id', validate(updateLessonSchema), studioController.updateLesson);
router.delete('/lessons/:id', studioController.deleteLesson);

module.exports = router;
