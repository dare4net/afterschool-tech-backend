const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { completeOnboardingBodySchema } = require('../contracts/platform');
const { createOnboarding, hasExperiencedOnboarding, ONBOARDING_BONUS } = require('../helpers/onboarding');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('W6 onboarding', () => {
    it('accepts skip plus identity and rejects a bad avatar', () => {
        assert.equal(completeOnboardingBodySchema.parse({ skipped: true, avatarId: 'kiwi' }).avatarId, 'kiwi');
        assert.equal(completeOnboardingBodySchema.safeParse({ avatarId: 'evil' }).success, false);
        assert.equal(hasExperiencedOnboarding({}), false);
        assert.equal(hasExperiencedOnboarding({ onboardingCompletedAt: new Date() }), true);
        assert.equal(hasExperiencedOnboarding({ onboardingSkippedAt: new Date() }), true);
    });

    it('awards a one-time bonus and never emits pride submit events', async () => {
        const users = new Map();
        users.set('maya', { user_id: 'maya', account_type: 'student', full_name: 'Maya' });
        let awarded = 0;
        const progressEvents = [];
        const api = createOnboarding({
            usersRepo: {
                findByUserId: async (id) => users.get(id) || null,
                handleTakenByOther: async () => false,
                updateIdentity: async (id, patch) => {
                    users.set(id, { ...users.get(id), ...patch });
                    return users.get(id);
                },
            },
            walletRepo: {
                earnTransaction: (amount, reason) => ({ amount, reason }),
                applyBalanceChange: async (id, { inc }) => {
                    awarded += inc;
                    return { starBalance: awarded };
                },
            },
            recordProgressEvent: async (userId, eventType, payload) => {
                progressEvents.push({ userId, eventType, payload });
                return { lifetimeStarsEarned: payload.amount };
            },
        });

        const first = await api.complete('maya', { full_name: 'Maya Codes', avatarId: 'rocket', handle: 'maya_codes' });
        assert.equal(first.status, 200);
        assert.equal(first.bonusAwarded, ONBOARDING_BONUS);
        assert.equal(progressEvents.length, 1);
        assert.equal(progressEvents[0].eventType, 'STARS_AWARDED');
        assert.equal(progressEvents[0].payload.amount, ONBOARDING_BONUS);
        assert.equal(first.handle, 'maya_codes');
        assert.ok(first.onboardingCompletedAt);

        const second = await api.complete('maya', { avatarId: 'kiwi' });
        assert.equal(second.bonusAwarded, 0);
        assert.equal(second.alreadyExperienced, true);
        assert.equal(awarded, ONBOARDING_BONUS);

        const tutor = await api.complete('maya', {});
        users.set('teo', { user_id: 'teo', account_type: 'tutor' });
        const blocked = await api.complete('teo', {});
        assert.equal(blocked.status, 403);
        assert.equal(tutor.bonusAwarded, 0);

        const skipUser = { user_id: 'leo', account_type: 'student' };
        users.set('leo', skipUser);
        const skipped = await api.complete('leo', { skipped: true });
        assert.equal(skipped.bonusAwarded, 0);
        assert.ok(skipped.onboardingSkippedAt);

        const helper = read('helpers/onboarding.js');
        assert.equal(helper.includes('COMPONENT_SUBMITTED'), false);
        assert.equal(helper.includes('LESSON_COMPLETED'), false);
        assert.equal(helper.includes('prideStats'), false);
        assert.match(read('controllers/onboardingController.js'), /getAuthenticatedUserId/);
        assert.equal(read('controllers/onboardingController.js').includes('getMainDb'), false);
        assert.match(read('server.js'), /app\.use\('\/api\/onboarding'/);
        assert.match(read('routes/onboardingRoutes.js'), /authorize/);
    });

    it('login and profile expose the onboarding flags without email on the helper payload', () => {
        assert.match(read('controllers/authController.js'), /onboardingCompletedAt/);
        assert.match(read('controllers/profileController.js'), /onboardingCompletedAt/);
        assert.match(read('repositories/usersRepo.js'), /onboardingSkippedAt/);
    });
});
