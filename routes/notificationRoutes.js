const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authorize } = require('../middleware/authorize');
const { markNotificationsBodySchema, validateBody } = require('../contracts/platform');

router.use(authorize);
router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.post('/read', validateBody(markNotificationsBodySchema), notificationController.markRead);

module.exports = router;
