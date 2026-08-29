const { ObjectId } = require('mongodb');
const { getMainDb, getLessonsDb } = require('../config/database');
const { SCORED_COMPONENT_TYPES } = require('../contracts/platform');

const SCORED_TYPES = new Set(SCORED_COMPONENT_TYPES);

function asObjectId(value) {
    if (!value) return null;
    if (value instanceof ObjectId) return value;
    const text = String(value);
    if (!/^[a-fA-F0-9]{24}$/.test(text)) return null;
    try {
        return new ObjectId(text);
    } catch {
        return null;
    }
}

function uniqueIds(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const id = asObjectId(value);
        if (!id) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(id);
    }
    return out;
}

function componentLabel(component) {
    const props = component && typeof component.props === 'object' ? component.props : {};
    const raw = props.title || props.question || props.prompt || props.label || component.type || 'Block';
    return String(raw).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function extractComponents(slides) {
    const out = [];
    const seen = new Set();
    for (const slide of Array.isArray(slides) ? slides : []) {
        for (const component of Array.isArray(slide?.components) ? slide.components : []) {
            if (!component || !component.id) continue;
            const type = String(component.type || 'unknown');
            if (!SCORED_TYPES.has(type)) continue;
            const id = String(component.id);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({
                id,
                type,
                title: componentLabel(component),
            });
        }
    }
    return out;
}

async function listLessonTargets({ limit = 200 } = {}) {
    const main = await getMainDb();
    const lessonsDb = await getLessonsDb();
    const catalog = await main.collection('lessons')
        .find({})
        .project({ title: 1, module_id: 1, lesson_data: 1, is_published: 1 })
        .limit(Math.min(Number(limit) || 200, 300))
        .toArray();

    const modules = uniqueIds(catalog.map((lesson) => lesson.module_id)).length
        ? await main.collection('modules')
            .find({ _id: { $in: uniqueIds(catalog.map((lesson) => lesson.module_id)) } })
            .project({ name: 1, program_id: 1, title: 1 })
            .toArray()
        : [];
    const moduleById = new Map(modules.map((mod) => [String(mod._id), mod]));

    const programs = uniqueIds(modules.map((mod) => mod.program_id)).length
        ? await main.collection('programs')
            .find({ _id: { $in: uniqueIds(modules.map((mod) => mod.program_id)) } })
            .project({ name: 1, title: 1 })
            .toArray()
        : [];
    const programById = new Map(programs.map((program) => [String(program._id), program]));

    const contentIds = uniqueIds(catalog.map((lesson) => lesson.lesson_data));
    const contents = contentIds.length
        ? await lessonsDb.collection('lessons')
            .find({ _id: { $in: contentIds } })
            .project({ id: 1, title: 1, slides: 1 })
            .toArray()
        : [];
    const contentById = new Map(contents.map((doc) => [String(doc._id), doc]));

    return catalog.map((lesson) => {
        const content = lesson.lesson_data ? contentById.get(String(lesson.lesson_data)) : null;
        const mod = lesson.module_id ? moduleById.get(String(lesson.module_id)) : null;
        const program = mod?.program_id ? programById.get(String(mod.program_id)) : null;
        return {
            id: content?.id || String(lesson._id),
            title: content?.title || lesson.title || 'Untitled lesson',
            programTitle: program?.name || program?.title || '',
            moduleTitle: mod?.name || mod?.title || '',
            published: lesson.is_published === true,
            components: extractComponents(content?.slides),
        };
    }).filter((lesson) => lesson.id);
}

module.exports = {
    listLessonTargets,
};
