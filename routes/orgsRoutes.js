const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const orgsController = require('../controllers/orgsController');
const cohortsController = require('../controllers/cohortsController');
const {
    validateBody,
    validateQuery,
    acceptOrgInviteBodySchema,
    completeOrgInviteBodySchema,
    joinCohortBodySchema,
    joinPreviewQuerySchema,
    createCohortBodySchema,
    updateCohortBodySchema,
    updateMyOrgBodySchema,
    addOrgMemberBodySchema,
} = require('../contracts/platform');

router.get('/public/:slug', orgsController.getPublicOrgBySlug);
router.get('/mine', authenticate, orgsController.listMyOrgs);
router.post('/invites/accept', authenticate, validateBody(acceptOrgInviteBodySchema), orgsController.acceptInvite);
router.get('/invites/:token', orgsController.previewInvite);
router.post('/invites/:token/complete', validateBody(completeOrgInviteBodySchema), orgsController.completeInvite);

router.get('/join/preview', validateQuery(joinPreviewQuerySchema), cohortsController.previewJoin);
router.post('/join', authenticate, validateBody(joinCohortBodySchema), cohortsController.joinCohort);

router.get('/:id', authenticate, orgsController.getMyOrg);
router.get('/:id/programs', authenticate, orgsController.listOrgPrograms);
router.patch('/:id', authenticate, validateBody(updateMyOrgBodySchema), orgsController.updateMyOrg);
router.post('/:id/members', authenticate, validateBody(addOrgMemberBodySchema), orgsController.addMyOrgMember);
router.delete('/:id/members/:memberId/invite', authenticate, orgsController.cancelInvite);
router.get('/:id/cohorts', authenticate, cohortsController.listCohorts);
router.post('/:id/cohorts', authenticate, validateBody(createCohortBodySchema), cohortsController.createCohort);
router.patch('/:id/cohorts/:cohortId', authenticate, validateBody(updateCohortBodySchema), cohortsController.updateCohort);

module.exports = router;
