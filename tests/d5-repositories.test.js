const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const controllers = [
    'controllers/walletController.js',
    'controllers/statsController.js',
    'controllers/missionController.js',
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
        assert.match(wallet, /student_wallets/);
        assert.match(stats, /lesson_completions/);
        assert.match(progress, /student_progress/);
        assert.match(catalog, /platform_missions/);
        assert.match(catalog, /platform_achievements/);
    });
});
