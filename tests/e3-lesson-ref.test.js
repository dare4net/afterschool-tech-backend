const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { ObjectId } = require('mongodb');
const {
    parseObjectId,
    buildLessonRef,
    resolveLessonRef,
    interactionLessonIds,
} = require('../helpers/lessonRef');

function memoryStores({ catalogs, contents }) {
    function match(doc, filter) {
        if (filter._id && String(doc._id) !== String(filter._id)) return false;
        if (filter.id && doc.id !== filter.id) return false;
        if (filter.lesson_data && String(doc.lesson_data) !== String(filter.lesson_data)) return false;
        return true;
    }
    return {
        findCatalog: async (filter) => catalogs.find((doc) => match(doc, filter)) || null,
        findContent: async (filter) => contents.find((doc) => match(doc, filter)) || null,
    };
}

describe('E3 LessonRef', () => {
    it('does not treat a public lesson id as an ObjectId', () => {
        assert.equal(parseObjectId('lesson-1719876543210'), null);
        assert.equal(parseObjectId('not-an-id'), null);
        const hex = '507f1f77bcf86cd799439011';
        assert.equal(String(parseObjectId(hex)), hex);
    });

    it('interaction keys prefer the public id', () => {
        const catalogId = new ObjectId();
        const contentId = new ObjectId();
        const ref = buildLessonRef({
            raw: 'lesson-abc',
            catalog: { _id: catalogId, lesson_data: contentId },
            content: { _id: contentId, id: 'lesson-abc' },
        });
        assert.equal(ref.publicId, 'lesson-abc');
        assert.equal(String(ref.catalogId), String(catalogId));
        assert.deepEqual(ref.interactionKeys[0], 'lesson-abc');
        assert.equal(ref.interactionKeys.includes(String(catalogId)), true);
    });

    it('resolves a public uuid to catalog + content', async () => {
        const catalogId = new ObjectId();
        const contentId = new ObjectId();
        const stores = memoryStores({
            catalogs: [{ _id: catalogId, module_id: new ObjectId(), lesson_data: contentId }],
            contents: [{ _id: contentId, id: 'lesson-uuid-1' }],
        });
        const ref = await resolveLessonRef('lesson-uuid-1', stores);
        assert.equal(ref.publicId, 'lesson-uuid-1');
        assert.equal(String(ref.catalogId), String(catalogId));
        assert.equal(String(ref.contentId), String(contentId));
    });

    it('resolves a catalog ObjectId to the public id', async () => {
        const catalogId = new ObjectId();
        const contentId = new ObjectId();
        const stores = memoryStores({
            catalogs: [{ _id: catalogId, lesson_data: contentId }],
            contents: [{ _id: contentId, id: 'lesson-uuid-2' }],
        });
        const ref = await resolveLessonRef(String(catalogId), stores);
        assert.equal(ref.publicId, 'lesson-uuid-2');
        assert.equal(String(ref.catalogId), String(catalogId));
    });

    it('falls back to the raw id when nothing resolves', async () => {
        const ids = await interactionLessonIds('unknown-lesson', memoryStores({
            catalogs: [],
            contents: [],
        }));
        assert.deepEqual(ids, ['unknown-lesson']);
    });

    it('funnels getLessonDetails, markCompleted, and tutor mark/reset through LessonRef', () => {
        const lesson = readFileSync(join(__dirname, '../controllers/lessonController.js'), 'utf8');
        const studio = readFileSync(join(__dirname, '../controllers/studioController.js'), 'utf8');
        assert.match(lesson, /resolveLessonRef/);
        assert.match(lesson, /module_id: metaData\?\.module_id/);
        assert.match(studio, /interactionLessonIds/);
        assert.equal(studio.includes('possibleLessonIds = Array.from'), false);
    });

    it('lesson completions store raw points and upsert per user+lesson', () => {
        const lesson = readFileSync(join(__dirname, '../controllers/lessonController.js'), 'utf8');
        assert.match(lesson, /max_score: possible/);
        assert.match(lesson, /lesson_completions'\).updateOne/);
        assert.match(lesson, /completed_at: completionFields\.completed_at/);
        assert.equal(lesson.includes('insertOne(completion'), false);
    });
});
