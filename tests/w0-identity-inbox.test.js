const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
    handleSchema,
    updateProfileBodySchema,
    markNotificationsBodySchema,
} = require('../contracts/platform');
const {
    sanitizeHandle,
    handleError,
    publicProfileFields,
    firstNameSlug,
    allocateHandleFromName,
} = require('../helpers/publicProfile');
const { notify, NOTIFICATION_TYPES } = require('../helpers/notify');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

describe('W0 handle identity', () => {
    it('accepts lowercase handles and rejects reserved or malformed ones', () => {
        assert.equal(handleSchema.parse('maya_codes'), 'maya_codes');
        assert.equal(sanitizeHandle('Maya_Codes'), 'maya_codes');
        assert.equal(handleError('maya_codes'), null);
        assert.equal(handleError('ab'), 'Use 3–24 characters: start with a letter, then letters, numbers, or _');
        assert.equal(handleError('admin'), 'That handle is reserved');
        assert.equal(handleError('superadmin'), 'That handle is reserved');
        assert.equal(handleSchema.safeParse('Admin').success, false);
        assert.equal(handleSchema.safeParse('ab').success, false);
        assert.equal(handleSchema.safeParse('maya-codes').success, false);
    });

    it('builds unique first-name handles without using email', () => {
        assert.equal(firstNameSlug('Maya Codes'), 'maya');
        assert.equal(firstNameSlug('Élodie Durand'), 'elodie');
        assert.equal(firstNameSlug('', 'Ab12Cd'), 'ab12cd');
        const taken = new Set(['maya', 'maya2']);
        assert.equal(allocateHandleFromName('Maya Codes', taken), 'maya3');
        assert.equal(allocateHandleFromName('Maya', new Set(), { existingHandle: 'maya_codes' }), 'maya_codes');
        assert.equal(handleError(allocateHandleFromName('Al', new Set(), { userId: 'Xy9k2m' })), null);
        const script = read('scripts/assign-public-handles.js');
        assert.match(script, /isPublicProfile: true/);
        assert.equal(script.includes('user.email'), false);
    });

    it('never puts email on public profile JSON', () => {
        const fields = publicProfileFields({
            handle: 'maya_codes',
            full_name: 'Maya',
            email: 'maya@school.edu',
            password_hash: 'secret',
            user_id: '12345',
            isPublicProfile: true,
        });
        const json = JSON.stringify(fields);
        assert.equal(fields.handle, 'maya_codes');
        assert.equal(fields.displayName, 'Maya');
        assert.equal(fields.accentColor, require('../helpers/publicProfile').defaultAccentColor('maya_codes'));
        assert.equal(fields.avatarId, require('../helpers/publicProfile').defaultAvatarId('maya_codes'));
        assert.equal(Object.prototype.hasOwnProperty.call(fields, 'email'), false);
        assert.equal(json.includes('email'), false);
        assert.equal(json.includes('maya@school.edu'), false);
        assert.equal(json.includes('password_hash'), false);
        assert.equal(json.includes('12345'), false);
    });

    it('cannot go public without a handle (controller + schema)', () => {
        assert.equal(updateProfileBodySchema.parse({ isPublicProfile: true }).isPublicProfile, true);
        const profile = read('controllers/profileController.js');
        assert.match(profile, /Choose a handle before making your profile public/);
        assert.match(profile, /That handle is taken/);
        assert.match(profile, /usersRepo\.handleTakenByOther/);
        assert.match(profile, /isPublicProfile === true && !nextHandle/);
        assert.match(profile, /avatarId/);
        assert.match(profile, /Pick an avatar/);
    });

    it('lets students pick a catalog avatar that is safe on public JSON', () => {
        const { resolveAvatarId, isAvatarId, AVATAR_IDS } = require('../helpers/publicProfile');
        assert.equal(isAvatarId('nova'), true);
        assert.equal(isAvatarId('not-a-face'), false);
        assert.equal(resolveAvatarId({ handle: 'maya_codes', avatarId: 'kiwi' }), 'kiwi');
        assert.equal(resolveAvatarId({ handle: 'maya_codes' }), require('../helpers/publicProfile').defaultAvatarId('maya_codes'));
        assert.ok(AVATAR_IDS.length >= 12);
        const fields = publicProfileFields({
            handle: 'maya_codes',
            full_name: 'Maya',
            email: 'maya@school.edu',
            avatarId: 'rocket',
        });
        assert.equal(fields.avatarId, 'rocket');
        assert.equal(JSON.stringify(fields).includes('maya@school.edu'), false);
        assert.equal(updateProfileBodySchema.parse({ avatarId: 'spark' }).avatarId, 'spark');
        assert.equal(updateProfileBodySchema.safeParse({ avatarId: 'evil' }).success, false);
    });
});

describe('W0 public people API', () => {
    it('mounts unauthenticated GET /api/people/:handle', () => {
        const server = read('server.js');
        assert.match(server, /app\.use\('\/api\/people',\s*peopleRoutes\)/);

        const routes = read('routes/peopleRoutes.js');
        assert.match(routes, /router\.get\('\/search'/);
        assert.match(routes, /router\.get\('\/:handle'/);
        assert.match(routes, /optionalAuthorize/);
        assert.match(routes, /router\.post\('\/:handle\/follow'/);
        assert.ok(routes.indexOf("router.get('/search'") < routes.indexOf("router.get('/:handle'"));
        assert.ok(routes.indexOf("router.post('/:handle/follow'") < routes.indexOf("router.get('/:handle'"));
        assert.equal(routes.includes('authenticate'), false);

        const controller = read('controllers/peopleController.js');
        assert.match(controller, /Profile not found/);
        assert.match(controller, /isPublicProfile !== true/);
        assert.match(controller, /searchPeople/);
        assert.equal(controller.includes('db.collection'), false);
        assert.equal(controller.includes('getMainDb'), false);
        assert.equal(controller.includes('email'), false);
    });

    it('uses the same 404 body for missing and private profiles', () => {
        const controller = read('controllers/peopleController.js');
        const notFoundCount = controller.split("error: 'Profile not found'").length - 1;
        assert.equal(notFoundCount, 1);
        assert.match(controller, /if \(!user \|\| user\.isPublicProfile !== true\)/);
        assert.match(controller, /return res\.status\(404\)\.json\(NOT_FOUND\)/);
    });
});

describe('W0 notifications inbox', () => {
    it('mounts authorized inbox routes and persists outside live aggregates', () => {
        const server = read('server.js');
        assert.match(server, /app\.use\('\/api\/notifications',\s*notificationRoutes\)/);
        assert.equal(server.includes("app.use('/api/notifications', pollRoutes)"), false);

        const routes = read('routes/notificationRoutes.js');
        assert.match(routes, /router\.use\(authorize\)/);
        assert.match(routes, /router\.get\('\/'/);
        assert.match(routes, /router\.get\('\/unread-count'/);
        assert.match(routes, /router\.post\('\/read'/);
        assert.match(routes, /validateBody\(markNotificationsBodySchema\)/);

        const repo = read('repositories/notificationsRepo.js');
        assert.match(repo, /COLLECTION = 'notifications'/);
        assert.match(repo, /user_id: 1, created_at: -1/);
        assert.equal(repo.includes('polls'), false);
        assert.equal(repo.includes('wordclouds'), false);

        const controller = read('controllers/notificationController.js');
        assert.equal(controller.includes('db.collection'), false);
        assert.equal(controller.includes('getMainDb'), false);
        assert.match(controller, /getAuthenticatedUserId/);
        assert.equal(controller.includes('req.query.userId'), false);
        assert.equal(controller.includes('req.body.userId'), false);
    });

    it('validates mark-read payloads and lists future social types', () => {
        assert.equal(markNotificationsBodySchema.parse({ all: true }).all, true);
        assert.deepEqual(markNotificationsBodySchema.parse({ ids: ['abc'] }).ids, ['abc']);
        assert.equal(markNotificationsBodySchema.safeParse({}).success, false);
        assert.deepEqual(NOTIFICATION_TYPES, [
            'ACHIEVEMENT_EARNED',
            'MISSION_CLAIMED',
            'LEVEL_UP',
            'FOLLOWED_YOU',
            'CROWN_GOLD',
            'PROGRAM_LESSON_PUBLISHED',
            'PROGRAM_MODULE_PUBLISHED',
            'TUTOR_MARKED',
            'NEXT_LESSON_UNLOCKED',
            'CLASS_POLL_LIVE',
            'CLASS_CLOUD_LIVE',
            'CLASS_SCALE_LIVE',
            'CLASS_ACTIVITY',
        ]);
    });

    it('notify never throws and ignores unknown types', async () => {
        const result = await notify({ userId: 'u1', type: 'NOT_A_TYPE', title: 'Nope' });
        assert.equal(result, null);
        const source = read('helpers/notify.js');
        assert.match(source, /notify_failed/);
        assert.match(source, /return null/);
    });

    it('writes inbox rows on newly earned achievements, first claim, and level-up', () => {
        const achievements = read('controllers/achievementController.js');
        assert.match(achievements, /type: 'ACHIEVEMENT_EARNED'/);
        assert.match(achievements, /await notify\(/);

        const missions = read('controllers/missionController.js');
        assert.match(missions, /if \(!result\.alreadyClaimed\)/);
        assert.match(missions, /type: 'MISSION_CLAIMED'/);
        assert.match(missions, /type: 'LEVEL_UP'/);
        assert.equal(missions.includes('polls'), false);
        assert.equal(missions.includes('wordclouds'), false);
    });
});
