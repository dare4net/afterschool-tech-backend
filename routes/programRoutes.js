const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');
const { authorize, authorizeRole } = require('../middleware/authorize');

// Public routes
router.get('/', programController.listPrograms);
router.get('/:programId', programController.getProgramDetails);

// Student routes
router.get('/my/programs', authorize, authorizeRole('student'), programController.getMyPrograms);
router.get('/my/programs/:programId/progress', authorize, authorizeRole('student'), programController.getMyProgramProgress);
router.post('/:programId/register', authorize, programController.registerForProgram);
router.delete('/:programId/unregister', authorize, programController.unregisterFromProgram);

module.exports = router;
