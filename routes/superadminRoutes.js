const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadminController');
const catalogController = require('../controllers/catalogController');
const { requireSuperadmin } = require('../middleware/superadmin');
const { authLimiter } = require('../middleware/httpGuards');
const loginLimiter = authLimiter();
const {
    validate,
    createMissionSchema,
    updateMissionSchema,
    createAchievementSchema,
    updateAchievementSchema,
} = require('../validators/studioValidators');
const {
    validateBody,
    createOrgBodySchema,
    updateOrgBodySchema,
    addOrgMemberBodySchema,
    createCohortBodySchema,
    updateCohortBodySchema,
} = require('../contracts/platform');
const orgsController = require('../controllers/orgsController');
const cohortsController = require('../controllers/cohortsController');

router.post('/login', loginLimiter, superadminController.login);

router.use(requireSuperadmin);
router.get('/me', superadminController.me);
router.get('/jobs', superadminController.listJobs);
router.post('/jobs/:id/run', superadminController.runJob);
router.get('/orgs', orgsController.listOrgs);
router.post('/orgs', validateBody(createOrgBodySchema), orgsController.createOrg);
router.get('/orgs/:id', orgsController.getOrg);
router.get('/orgs/:id/programs', orgsController.listOrgPrograms);
router.patch('/orgs/:id', validateBody(updateOrgBodySchema), orgsController.updateOrg);
router.post('/orgs/:id/members', validateBody(addOrgMemberBodySchema), orgsController.addMember);
router.delete('/orgs/:id/members/:memberId/invite', orgsController.cancelInvite);
router.get('/orgs/:id/cohorts', cohortsController.listCohorts);
router.post('/orgs/:id/cohorts', validateBody(createCohortBodySchema), cohortsController.createCohort);
router.patch('/orgs/:id/cohorts/:cohortId', validateBody(updateCohortBodySchema), cohortsController.updateCohort);
router.get('/catalog/meta', catalogController.getMeta);
router.get('/catalog/targets', catalogController.listTargets);
router.get('/catalog/missions', catalogController.listMissions);
router.post('/catalog/missions', validate(createMissionSchema), catalogController.createMission);
router.put('/catalog/missions/:id', validate(updateMissionSchema), catalogController.updateMission);
router.delete('/catalog/missions/:id', catalogController.deleteMission);
router.get('/catalog/achievements', catalogController.listAchievements);
router.post('/catalog/achievements', validate(createAchievementSchema), catalogController.createAchievement);
router.put('/catalog/achievements/:id', validate(updateAchievementSchema), catalogController.updateAchievement);
router.delete('/catalog/achievements/:id', catalogController.deleteAchievement);

module.exports = router;
