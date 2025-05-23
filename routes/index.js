const express = require('express');
const router = express.Router();

const achievementsRoutes = require('./achievements');
const submissionsRoutes = require('./submissions');
const curriculumStartsRoutes = require('./curriculumStarts');
// ...other route imports...

router.use('/achievements', achievementsRoutes);
router.use('/submissions', submissionsRoutes);
router.use('/curriculum-starts', curriculumStartsRoutes);
// ...other route uses...

module.exports = router;