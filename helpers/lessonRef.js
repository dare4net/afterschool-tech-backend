const { ObjectId } = require('mongodb');
const { getMainDb, getLessonsDb } = require('../config/database');

const OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/;

function parseObjectId(id) {
    if (id instanceof ObjectId) return id;
    const value = String(id || '');
    if (!OBJECT_ID_HEX.test(value)) return null;
    try {
        return new ObjectId(value);
    } catch {
        return null;
    }
}

function uniqueStrings(values) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        if (value === undefined || value === null || value === '') continue;
        const asString = String(value);
        if (seen.has(asString)) continue;
        seen.add(asString);
        out.push(asString);
    }
    return out;
}

function buildLessonRef({ raw, catalog, content }) {
    const publicId = content?.id ? String(content.id) : null;
    const catalogId = catalog?._id || null;
    const contentId = content?._id || null;
    return {
        raw: String(raw || ''),
        publicId,
        catalogId,
        contentId,
        catalog: catalog || null,
        content: content || null,
        interactionKeys: uniqueStrings([publicId, raw, contentId, catalogId]),
    };
}

function defaultStores() {
    return {
        async findCatalog(filter) {
            return (await getMainDb()).collection('lessons').findOne(filter);
        },
        async findContent(filter) {
            return (await getLessonsDb()).collection('lessons').findOne(filter);
        },
    };
}

async function resolveLessonRef(rawId, stores) {
    const raw = String(rawId || '');
    if (!raw) return null;
    const { findCatalog, findContent } = stores || defaultStores();

    const oid = parseObjectId(raw);
    let catalog = null;
    let content = null;

    if (oid) {
        catalog = await findCatalog({ _id: oid });
        if (catalog && catalog.lesson_data) {
            const dataOid = parseObjectId(catalog.lesson_data) || catalog.lesson_data;
            content = await findContent({ _id: dataOid });
            if (!content) {
                content = await findContent({ id: String(catalog.lesson_data) });
            }
        }
        if (!catalog) {
            content = await findContent({ _id: oid });
        }
    }

    if (!content) {
        content = await findContent({ id: raw });
    }

    if (content && !catalog) {
        catalog = await findCatalog({ lesson_data: content._id });
    }

    if (!catalog && !content) return null;
    return buildLessonRef({ raw, catalog, content });
}

async function interactionLessonIds(rawId, stores) {
    const ref = await resolveLessonRef(rawId, stores);
    return ref ? ref.interactionKeys : uniqueStrings([rawId]);
}

module.exports = {
    parseObjectId,
    uniqueStrings,
    buildLessonRef,
    resolveLessonRef,
    interactionLessonIds,
};
