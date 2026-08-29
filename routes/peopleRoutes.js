const express = require('express');
const router = express.Router();
const peopleController = require('../controllers/peopleController');
const { authorize, optionalAuthorize } = require('../middleware/authorize');

router.get('/search', optionalAuthorize, peopleController.searchPeople);
router.post('/:handle/follow', authorize, peopleController.followPerson);
router.delete('/:handle/follow', authorize, peopleController.unfollowPerson);
router.post('/:handle/mute', authorize, peopleController.mutePerson);
router.post('/:handle/block', authorize, peopleController.blockPerson);
router.delete('/:handle/block', authorize, peopleController.unblockPerson);
router.get('/:handle', optionalAuthorize, peopleController.getPublicProfile);

module.exports = router;
