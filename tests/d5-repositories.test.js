const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const controllers = [
    'controllers/walletController.js',
    'controllers/statsController.js',
    'controllers/missionController.js',
    'controllers/peopleController.js',
    'controllers/notificationController.js',
    'controllers/prideController.js',
    'controllers/storeController.js',
    'controllers/onboardingController.js',
    'controllers/liveAggregatesController.js',
    'controllers/pushController.js',
];

describe('D5 wallet/stats/mission repositories', () => {
    it('controllers do not call db.collection', () => {
        for (const file of controllers) {
            const source = readFileSync(join(__dirname, '..', file), 'utf8');
            assert.equal(source.includes('db.collection'), false, file);
            assert.equal(source.includes('getMainDb'), false, file);
        }
    });

    it('collection access lives in repositories', () => {
        const wallet = readFileSync(join(__dirname, '../repositories/walletRepo.js'), 'utf8');
        const stats = readFileSync(join(__dirname, '../repositories/statsRepo.js'), 'utf8');
        const progress = readFileSync(join(__dirname, '../repositories/progressRepo.js'), 'utf8');
        const catalog = readFileSync(join(__dirname, '../repositories/catalogRepo.js'), 'utf8');
        const notifications = readFileSync(join(__dirname, '../repositories/notificationsRepo.js'), 'utf8');
        const users = readFileSync(join(__dirname, '../repositories/usersRepo.js'), 'utf8');
        const pride = readFileSync(join(__dirname, '../repositories/prideRepo.js'), 'utf8');
        const follows = readFileSync(join(__dirname, '../repositories/followsRepo.js'), 'utf8');
        const curriculum = readFileSync(join(__dirname, '../repositories/curriculumRepo.js'), 'utf8');
        const inventory = readFileSync(join(__dirname, '../repositories/inventoryRepo.js'), 'utf8');
        const jobs = readFileSync(join(__dirname, '../repositories/jobsRepo.js'), 'utf8');
        const dedupe = readFileSync(join(__dirname, '../repositories/notifyDedupeRepo.js'), 'utf8');
        assert.match(wallet, /student_wallets/);
        assert.match(stats, /lesson_completions/);
        assert.match(progress, /student_progress/);
        assert.match(catalog, /platform_missions/);
        assert.match(catalog, /platform_achievements/);
        assert.match(notifications, /notifications/);
        assert.match(users, /handle: 1/);
        assert.match(users, /fcmTokens/);
        assert.match(pride, /student_public_stats/);
        assert.match(pride, /stats_ranks/);
        assert.match(follows, /follows/);
        assert.match(follows, /blocks/);
        assert.match(curriculum, /program_registrations/);
        assert.match(curriculum, /lesson_completions/);
        assert.match(inventory, /student_inventory/);
        assert.match(jobs, /job_runs/);
        assert.match(jobs, /reminder_sends/);
        assert.match(dedupe, /notify_claims/);
    });
});
