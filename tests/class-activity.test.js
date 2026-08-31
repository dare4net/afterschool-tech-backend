const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { crossedMilestone, createClassActivity, MILESTONES } = require('../helpers/classActivity');
const { inboxTypes, isPushServer, CATALOG } = require('../helpers/notificationCatalog');
const { NOTIFICATION_TYPES } = require('../helpers/notify');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('class activity notifications', () => {
    it('fires the highest milestone crossed, not every tap', () => {
        assert.deepEqual(MILESTONES, [1, 5, 10, 25]);
        assert.equal(crossedMilestone(0, 1), 1);
        assert.equal(crossedMilestone(1, 2), null);
        assert.equal(crossedMilestone(4, 5), 5);
        assert.equal(crossedMilestone(4, 12), 10);
        assert.equal(crossedMilestone(25, 26), null);
    });

    it('fans out a poll milestone once, skips the voter, and pings the tutor', async () => {
        const claimed = new Set();
        const notes = [];
        const enrolled = [];
        const activity = createClassActivity({
            async claimOnce(key) {
                if (claimed.has(key)) return false;
                claimed.add(key);
                return true;
            },
            async claimThrottle() {
                return true;
            },
            async resolveLesson() {
                return {
                    publicId: 'les-public',
                    catalog: { _id: 'les1', module_id: 'mod1', title: 'Loops' },
                    content: { title: 'Loops' },
                };
            },
            curriculumRepo: {
                async findModule() {
                    return { _id: 'mod1', program_id: 'prog1' };
                },
                async findProgram() {
                    return { _id: 'prog1', name: 'Python', tutor_id: 'tutor-1' };
                },
            },
            async notifyEnrolled(input) {
                enrolled.push(input);
                return { notified: 2 };
            },
            async notify(input) {
                notes.push(input);
                return input;
            },
        });

        const first = await activity.onPollVote({
            lessonId: 'les-public',
            componentId: 'poll-1',
            actorId: 'student-a',
            previousTotal: 0,
            nextTotal: 1,
        });
        assert.equal(first.milestone, 1);
        assert.equal(enrolled.length, 1);
        assert.equal(enrolled[0].type, 'CLASS_POLL_LIVE');
        assert.equal(enrolled[0].actorId, 'student-a');
        assert.equal(notes[0].type, 'CLASS_ACTIVITY');
        assert.equal(notes[0].userId, 'tutor-1');
        assert.equal(JSON.stringify(enrolled[0]).includes('secret-word'), false);

        const again = await activity.onPollVote({
            lessonId: 'les-public',
            componentId: 'poll-1',
            actorId: 'student-b',
            previousTotal: 0,
            nextTotal: 1,
        });
        assert.equal(again.notified, 0);
        assert.equal(enrolled.length, 1);
        assert.equal(notes.length, 1);
    });

    it('does not put the submitted word-cloud token in mail', async () => {
        const enrolled = [];
        const activity = createClassActivity({
            async claimOnce() { return true; },
            async claimThrottle() { return false; },
            async resolveLesson() {
                return { publicId: 'les-public', catalog: { _id: 'les1', module_id: 'mod1', title: 'Weather' } };
            },
            curriculumRepo: {
                async findModule() { return { _id: 'mod1', program_id: 'prog1' }; },
                async findProgram() { return { _id: 'prog1', tutor_id: 'tutor-1' }; },
            },
            async notifyEnrolled(input) {
                enrolled.push(input);
                return { notified: 1 };
            },
            async notify() { return null; },
        });
        await activity.onCloudWord({
            lessonId: 'les-public',
            componentId: 'cloud-1',
            actorId: 'student-a',
            previousTotal: 4,
            nextTotal: 5,
        });
        assert.equal(enrolled[0].type, 'CLASS_CLOUD_LIVE');
        assert.equal(JSON.stringify(enrolled[0]).includes('pineapple'), false);
        assert.match(enrolled[0].body, /5 responses/);
    });

    it('registers push-worthy inbox types and wires live routes', () => {
        assert.deepEqual(NOTIFICATION_TYPES, inboxTypes());
        assert.equal(isPushServer('CLASS_POLL_LIVE'), true);
        assert.equal(isPushServer('CLASS_CLOUD_LIVE'), true);
        assert.equal(isPushServer('CLASS_SCALE_LIVE'), true);
        assert.equal(isPushServer('CLASS_ACTIVITY'), true);
        assert.equal(isPushServer('NEXT_LESSON_UNLOCKED'), true);
        assert.equal(isPushServer('STREAK_REMINDER'), true);
        assert.equal(CATALOG.STREAK_REMINDER.inbox, false);
        assert.equal(CATALOG.ACHIEVEMENT_EARNED.pushServer, false);

        const polls = read('controllers/liveAggregatesController.js');
        assert.match(polls, /onPollVote/);
        assert.match(polls, /onCloudWord/);
        assert.match(polls, /onScaleRating/);
        assert.equal(polls.includes('getMainDb'), false);
        assert.match(read('controllers/interactionController.js'), /notifyIfProgressUnlockedNext/);
        assert.match(read('helpers/starStore.js'), /notifyIfStarUnlocked/);
        assert.match(read('helpers/lessonUnlock.js'), /NEXT_LESSON_UNLOCKED/);
        assert.match(read('helpers/notify.js'), /isPushServer/);
    });
});
