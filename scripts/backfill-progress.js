/**
 * Full backfill script:
 *
 * Phase 1: Reads ast_lessons.interactions where lessonState.progress === 100,
 *          resolves each to an afterschooltech.lessons._id, and creates
 *          lesson_completions records that were never saved (due to the UUID bug).
 *
 * Phase 2: Recalculates percent_complete and completed_modules on every
 *          program_registration based on the now-complete lesson_completions.
 *
 * Run once from the backend root:
 *   node scripts/backfill-progress.js
 */

require('dotenv').config();
const { ObjectId } = require('mongodb');
const { getMainDb, getLessonsDb, closeDB } = require('../config/database');

const toObjectId = (id) => {
    try { return new ObjectId(id); } catch { return null; }
};

async function backfill() {
    const db = await getMainDb();
    const lessonsDb = await getLessonsDb();

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Backfill lesson_completions from ast_lessons.interactions
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════');
    console.log('  PHASE 1: Backfilling lesson_completions from interactions');
    console.log('═══════════════════════════════════════════════════════\n');

    // 1a. Get all interactions where the lesson was fully completed
    const completedInteractions = await lessonsDb.collection('interactions')
        .find({ 'lessonState.progress': 100 })
        .toArray();

    console.log(`Found ${completedInteractions.length} completed interactions in ast_lessons.\n`);

    // 1b. Build a lookup map: ast_lessons.lessons._id → afterschooltech.lessons._id
    //     so we only query the DB once per unique ast lesson
    const allAstLessons = await lessonsDb.collection('lessons')
        .find({}, { projection: { _id: 1, id: 1 } })
        .toArray();

    // Map: ast string ID (e.g. "lesson-xxxx") → ast ObjectId
    const astIdToObjectId = new Map(allAstLessons.map(l => [l.id, l._id]));

    // Map: ast ObjectId string → afterschooltech.lessons document
    const allMainLessons = await db.collection('lessons')
        .find({ lesson_data: { $exists: true } }, { projection: { _id: 1, lesson_data: 1, module_id: 1 } })
        .toArray();

    // Map: ast_lessons._id.toString() → afterschooltech.lessons._id
    const astObjIdToMainLesson = new Map(
        allMainLessons.map(l => [l.lesson_data.toString(), l])
    );

    let createdCompletions = 0;
    let skippedDuplicates = 0;
    let skippedUnresolved = 0;

    for (const interaction of completedInteractions) {
        const userId = interaction.userId;
        const astLessonStringId = interaction.lessonId; // e.g. "lesson-xxxx"

        // Resolve: ast string ID → ast ObjectId → main lesson ObjectId
        const astObjectId = astIdToObjectId.get(astLessonStringId);
        if (!astObjectId) {
            skippedUnresolved++;
            continue;
        }

        const mainLesson = astObjIdToMainLesson.get(astObjectId.toString());
        if (!mainLesson) {
            skippedUnresolved++;
            continue;
        }

        // Check if a completion record already exists for this user + lesson
        const existing = await db.collection('lesson_completions').findOne({
            user_id: userId,
            lesson_id: mainLesson._id
        });

        if (existing) {
            skippedDuplicates++;
            continue;
        }

        // Create the missing completion record
        const score = interaction.lessonState?.score || 0;
        const maxScore = interaction.lessonState?.totalScore || 0;
        await db.collection('lesson_completions').insertOne({
            user_id: userId,
            lesson_id: mainLesson._id,
            completed_at: interaction.lastUpdated ? new Date(interaction.lastUpdated) : new Date(),
            score: score,
            max_score: maxScore,
            time_spent: 0,
            backfilled: true // Mark so we know it was retroactively created
        });

        console.log(`  ✅ Created completion: user=${userId} | lesson=${mainLesson._id} | ast="${astLessonStringId}" | score=${score}`);
        createdCompletions++;
    }

    console.log(`\nPhase 1 Summary:`);
    console.log(`  Created: ${createdCompletions}`);
    console.log(`  Skipped (already existed): ${skippedDuplicates}`);
    console.log(`  Skipped (unresolved ID): ${skippedUnresolved}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Recalculate percent_complete for all program_registrations
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════');
    console.log('  PHASE 2: Recalculating program progress');
    console.log('═══════════════════════════════════════════════════════\n');

    const programs = await db.collection('programs')
        .find({}, { projection: { _id: 1, modules: 1 } })
        .toArray();

    // Build program → lessons map
    const programLessonMap = new Map();
    for (const program of programs) {
        const moduleObjectIds = (program.modules || []).map(id => toObjectId(id)).filter(Boolean);
        const lessons = await db.collection('lessons')
            .find({ module_id: { $in: moduleObjectIds } })
            .project({ _id: 1, module_id: 1 })
            .toArray();
        programLessonMap.set(program._id.toString(), { moduleIds: moduleObjectIds, lessons });
    }

    const registrations = await db.collection('program_registrations').find({}).toArray();
    let updated = 0;
    let skipped = 0;

    for (const reg of registrations) {
        const programId = reg.program_id.toString();
        const programData = programLessonMap.get(programId);

        if (!programData || programData.lessons.length === 0) {
            skipped++;
            continue;
        }

        const { moduleIds, lessons } = programData;
        const lessonIds = lessons.map(l => l._id);

        const completedDocs = await db.collection('lesson_completions')
            .find({ user_id: reg.user_id, lesson_id: { $in: lessonIds } })
            .project({ lesson_id: 1 })
            .toArray();

        const completedLessonIdSet = new Set(completedDocs.map(c => c.lesson_id.toString()));
        const completedCount = completedLessonIdSet.size;
        const totalCount = lessons.length;
        const percentComplete = Math.round((completedCount / totalCount) * 100);

        const completedModuleIds = moduleIds.filter(modId => {
            const modLessons = lessons.filter(l => l.module_id.toString() === modId.toString());
            return modLessons.length > 0 && modLessons.every(l => completedLessonIdSet.has(l._id.toString()));
        });

        await db.collection('program_registrations').updateOne(
            { _id: reg._id },
            {
                $set: {
                    'progress.percent_complete': percentComplete,
                    'progress.completed_modules': completedModuleIds
                }
            }
        );

        console.log(`  ✅ user=${reg.user_id} | program=${programId} | ${completedCount}/${totalCount} lessons = ${percentComplete}%`);
        updated++;
    }

    console.log(`\nPhase 2 Summary:`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped (no lessons): ${skipped}`);

    console.log('\n✅ Full backfill complete!');
    await closeDB();
}

backfill().catch(err => {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
});
