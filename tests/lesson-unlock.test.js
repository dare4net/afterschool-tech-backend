const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { applySequentialUnlock, meetsUnlockThreshold, LESSON_UNLOCK_PROGRESS, LESSON_EARLY_UNLOCK_COST } = require('../helpers/lessonUnlock');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('sequential lesson unlock', () => {
    it('locks later lessons until the previous one is halfway done', () => {
        const rows = applySequentialUnlock([
            { lessonId: 'a', progress: 20 },
            { lessonId: 'b', progress: 0 },
        ]);
        assert.equal(rows[0].locked, false);
        assert.equal(rows[1].locked, true);
        assert.equal(meetsUnlockThreshold({ progress: 50 }), true);
        assert.equal(LESSON_UNLOCK_PROGRESS, 50);
        assert.equal(LESSON_EARLY_UNLOCK_COST, 20);
    });

    it('opens the next lesson at 50% or after a star skip', () => {
        const half = applySequentialUnlock([
            { lessonId: 'a', progress: 50 },
            { lessonId: 'b', progress: 0 },
        ]);
        assert.equal(half[1].locked, false);
        const skipped = applySequentialUnlock([
            { lessonId: 'a', progress: 0 },
            { lessonId: 'b', progress: 0 },
        ], ['b']);
        assert.equal(skipped[1].locked, false);
        assert.match(read('routes/storeRoutes.js'), /unlock-lesson/);
        assert.match(read('helpers/starStore.js'), /unlockLesson/);
        assert.match(read('helpers/starStore.js'), /notifyIfStarUnlocked/);
        assert.match(read('controllers/lessonController.js'), /applySequentialUnlock/);
        assert.match(read('helpers/lessonUnlock.js'), /notifyIfProgressUnlockedNext/);
        assert.match(read('helpers/lessonUnlock.js'), /NEXT_LESSON_UNLOCKED/);
    });
});
