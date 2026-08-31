const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('path');
const { componentMaxPoints, summarizeLessonHunt } = require('../helpers/lessonHunt');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('Lesson hunt summaries', () => {
    it('counts practice and live points and estimates live stars', () => {
        const hunt = summarizeLessonHunt([
            {
                title: 'Warmup',
                components: [
                    { type: 'quiz', mode: 'practice', props: { points: 5, mode: 'practice', questions: [{}, {}] } },
                    { type: 'dragDrop', props: { points: 2, mode: 'live', items: [{}, {}, {}] } },
                ],
            },
        ]);
        assert.equal(componentMaxPoints({ type: 'dragDrop', props: { points: 2, items: [{}, {}, {}] } }), 6);
        assert.equal(hunt.practicePoints, 10);
        assert.equal(hunt.livePoints, 6);
        assert.equal(hunt.totalPoints, 16);
        assert.equal(hunt.maxStars, 15);
        assert.equal(hunt.activities.length, 2);
        assert.equal(hunt.activities[1].maxStars, 15);
    });

    it('is wired into module lessons and curriculum search', () => {
        assert.match(read('controllers/lessonController.js'), /summarizeLessonHunt/);
        assert.match(read('controllers/lessonController.js'), /obtainableStars/);
        assert.match(read('controllers/programController.js'), /searchCurriculum/);
        assert.match(read('routes/programRoutes.js'), /\/search/);
    });
});
