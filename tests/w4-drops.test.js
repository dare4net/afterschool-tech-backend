const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createCurriculumDrops, isLive, becameLive } = require('../helpers/curriculumDrops');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

function memoryCurriculumRepo({
    program = { _id: 'prog1', name: 'Python', is_published: true },
    modules = [{ _id: 'mod1', name: 'Basics', is_published: true }],
    lessons = [
        { _id: 'les1', module_id: 'mod1', title: 'Hello', is_published: true },
        { _id: 'les2', module_id: 'mod1', title: 'Draft', is_published: false },
    ],
    enrolled = ['student-a'],
    completions = { 'student-a': ['les1'] },
} = {}) {
    const progressWrites = [];
    return {
        progressWrites,
        async findProgram() {
            return program;
        },
        async listModulesForProgram() {
            return modules;
        },
        async listLessonsForModules() {
            return lessons;
        },
        async listEnrolledUserIds() {
            return enrolled;
        },
        async listCompletedLessonIds(userId) {
            return completions[userId] || [];
        },
        async updateRegistrationProgress(userId, programId, fields) {
            progressWrites.push({ userId, programId, fields });
        },
    };
}

describe('W4 curriculum drops', () => {
    it('treats missing is_published as live and detects false → true', () => {
        assert.equal(isLive({}), true);
        assert.equal(isLive({ is_published: false }), false);
        assert.equal(isLive({ is_deleted: true }), false);
        assert.equal(becameLive({ is_published: false }, { is_published: true, title: 'Quiz 2' }), true);
        assert.equal(becameLive({ title: 'Quiz 2' }, { title: 'Quiz 2', updated_at: new Date() }), false);
    });

    it('percent uses currently published lessons only', async () => {
        const drops = createCurriculumDrops({ curriculumRepo: memoryCurriculumRepo() });
        const progress = await drops.computeProgress('student-a', 'prog1');
        assert.equal(progress.published_lessons, 1);
        assert.equal(progress.completed_published_lessons, 1);
        assert.equal(progress.percent_complete, 100);

        const afterDrop = createCurriculumDrops({
            curriculumRepo: memoryCurriculumRepo({
                lessons: [
                    { _id: 'les1', module_id: 'mod1', title: 'Hello', is_published: true },
                    { _id: 'les2', module_id: 'mod1', title: 'Loops', is_published: true },
                ],
            }),
        });
        const dropped = await afterDrop.computeProgress('student-a', 'prog1');
        assert.equal(dropped.published_lessons, 2);
        assert.equal(dropped.completed_published_lessons, 1);
        assert.equal(dropped.percent_complete, 50);
    });

    it('ignores lessons inside unpublished modules', async () => {
        const drops = createCurriculumDrops({
            curriculumRepo: memoryCurriculumRepo({
                modules: [{ _id: 'mod1', name: 'Hidden', is_published: false }],
                lessons: [{ _id: 'les1', module_id: 'mod1', title: 'Hello', is_published: true }],
            }),
        });
        const progress = await drops.computeProgress('student-a', 'prog1');
        assert.equal(progress.published_lessons, 0);
        assert.equal(progress.percent_complete, 0);
    });

    it('fans publish mail to enrolled students only, never followers', async () => {
        const mail = [];
        const drops = createCurriculumDrops({
            curriculumRepo: memoryCurriculumRepo({
                enrolled: ['student-a'],
            }),
            notify: async (row) => {
                mail.push(row);
                return row;
            },
        });

        await drops.handleLessonWrite({
            before: { _id: 'les2', module_id: 'mod1', title: 'Loops', is_published: false },
            after: { _id: 'les2', module_id: 'mod1', title: 'Loops', is_published: true },
            module: { _id: 'mod1', name: 'Basics', is_published: true },
            program: { _id: 'prog1', name: 'Python', is_published: true },
            actorId: 'tutor-1',
        });

        assert.equal(mail.length, 1);
        assert.equal(mail[0].userId, 'student-a');
        assert.equal(mail[0].actorId, 'tutor-1');
        assert.equal(mail[0].type, 'PROGRAM_LESSON_PUBLISHED');
        assert.equal(JSON.stringify(mail[0]).includes('email'), false);
        assert.equal(JSON.stringify(mail[0]).includes('@'), false);
        assert.match(mail[0].href, /\/dashboard\/student\/programs\/prog1\/modules\/mod1/);
    });

    it('does not mail a follower who is not enrolled, and skips the publisher', async () => {
        const mail = [];
        const drops = createCurriculumDrops({
            curriculumRepo: memoryCurriculumRepo({
                enrolled: ['tutor-1', 'student-a'],
            }),
            notify: async (row) => {
                mail.push(row);
                return row;
            },
        });

        const result = await drops.handleModuleWrite({
            before: { _id: 'mod1', name: 'Basics', is_published: false },
            after: { _id: 'mod1', name: 'Basics', is_published: true },
            program: { _id: 'prog1', name: 'Python', is_published: true },
            actorId: 'tutor-1',
        });

        assert.equal(result.notified, 1);
        assert.deepEqual(mail.map((row) => row.userId), ['student-a']);
        assert.equal(mail[0].type, 'PROGRAM_MODULE_PUBLISHED');
        assert.equal(mail.some((row) => row.userId === 'follower-x'), false);
    });

    it('does not notify when an already-live lesson is saved', async () => {
        const mail = [];
        const drops = createCurriculumDrops({
            curriculumRepo: memoryCurriculumRepo(),
            notify: async (row) => mail.push(row),
        });
        const result = await drops.handleLessonWrite({
            before: { _id: 'les1', title: 'Hello', is_published: true },
            after: { _id: 'les1', title: 'Hello world', is_published: true },
            module: { _id: 'mod1', is_published: true },
            program: { _id: 'prog1', is_published: true },
            actorId: 'tutor-1',
        });
        assert.equal(result.notified, 0);
        assert.equal(mail.length, 0);
    });

    it('wires studio publish, live percent on my programs, and completion recalc', () => {
        const studio = read('controllers/studioController.js');
        const programs = read('controllers/programController.js');
        const lessons = read('controllers/lessonController.js');
        const helper = read('helpers/curriculumDrops.js');
        const repo = read('repositories/curriculumRepo.js');
        const validators = read('validators/studioValidators.js');

        assert.match(studio, /curriculumDrops\.handleModuleWrite/);
        assert.match(studio, /curriculumDrops\.handleLessonWrite/);
        assert.match(studio, /curriculumDrops\.recalcProgram/);
        assert.match(studio, /is_published !== undefined/);
        assert.match(programs, /progressForUser/);
        assert.match(lessons, /persistProgress/);
        assert.match(lessons, /req\.user\?\.role === 'student'/);
        assert.match(lessons, /curriculumDrops\.isLive/);
        assert.match(helper, /listEnrolledUserIds/);
        assert.equal(helper.includes('db.collection'), false);
        assert.equal(helper.includes('getMainDb'), false);
        assert.match(repo, /status: \{ \$ne: 'unenrolled' \}/);
        assert.match(validators, /is_published: z\.boolean\(\)\.optional\(\)/);
        assert.equal(studio.includes('listFollowers'), false);
        assert.equal(helper.includes('listFollowerIds'), false);
    });
});
