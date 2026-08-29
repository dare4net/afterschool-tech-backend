/**
 * One-time pride backfill from stored progress.
 *
 * Rebuilds count boards (submits by type, live completes, perfect first tries,
 * lessons, enrollments, current streak). Does NOT invent fastest-live times —
 * those need first-attempt live duration, which was never kept historically.
 *
 * Idempotent: never lowers an existing pride count. Does not send gold toasts.
 *
 *   node scripts/backfill-pride.js
 *   node scripts/backfill-pride.js --dry-run
 *   node scripts/backfill-pride.js --user=Ab12Cd
 */

require('dotenv').config();
const { getMainDb, closeDB } = require('../config/database');
const usersRepo = require('../repositories/usersRepo');
const progressRepo = require('../repositories/progressRepo');
const statsRepo = require('../repositories/statsRepo');
const prideRepo = require('../repositories/prideRepo');
const followsRepo = require('../repositories/followsRepo');
const { createPrideStats } = require('../helpers/prideStats');
const { reconstructPrideCounts, skippedPrideKeys } = require('../helpers/prideBackfill');

function parseArgs(argv) {
    const dryRun = argv.includes('--dry-run');
    const userArg = argv.find((item) => item.startsWith('--user='));
    const onlyUser = userArg ? userArg.slice('--user='.length).trim() : '';
    return { dryRun, onlyUser };
}

async function collectUserIds(db, onlyUser) {
    if (onlyUser) return [onlyUser];
    const [fromUsers, fromProgress, fromCompletions, fromRegs] = await Promise.all([
        db.collection('users').distinct('user_id'),
        db.collection('student_progress').distinct('user_id'),
        db.collection('lesson_completions').distinct('user_id'),
        db.collection('program_registrations').distinct('user_id'),
    ]);
    return [...new Set([...fromUsers, ...fromProgress, ...fromCompletions, ...fromRegs].filter(Boolean))];
}

function asDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function snapshotFor(userId) {
    const [progress, completions, regCount, programCount, achievementsEarned, followers] = await Promise.all([
        progressRepo.findByUserId(userId),
        statsRepo.listCompletions(userId),
        statsRepo.countProgramRegistrations(userId),
        statsRepo.countUserPrograms(userId),
        statsRepo.countAchievements(userId),
        followsRepo.countFollowers(userId),
    ]);
    const counts = reconstructPrideCounts({
        progress: progress || {},
        lessonsCompleted: completions.length,
        programsEnrolled: Math.max(regCount, programCount),
        achievementsEarned,
        followers,
    });
    const at = asDate(progress && progress.updated_at)
        || asDate(progress && progress.created_at)
        || asDate(completions[0] && completions[0].completed_at)
        || new Date(0);
    return { counts, at, hasProgress: Boolean(progress) };
}

function countsLookEmpty(counts) {
    if (counts.liveCompleted || counts.perfectFirstTries || counts.lessonsCompleted || counts.programsEnrolled || counts.currentStreak || counts.missionsClaimed || counts.lifetimeStars || counts.achievementsEarned || counts.followers) {
        return false;
    }
    return Object.keys(counts.byType || {}).length === 0;
}

async function main() {
    const { dryRun, onlyUser } = parseArgs(process.argv.slice(2));
    const db = await getMainDb();
    await usersRepo.ensureIndexes();
    await prideRepo.ensureIndexes();

    const prideStats = createPrideStats();
    const skipped = skippedPrideKeys();
    const userIds = await collectUserIds(db, onlyUser);

    console.log('Pride count backfill');
    console.log(`  students: ${userIds.length}${onlyUser ? ` (filter ${onlyUser})` : ''}`);
    console.log(`  dry-run: ${dryRun ? 'yes' : 'no'}`);
    console.log(`  skipped boards: ${skipped.join(', ')}`);
    console.log('');

    let scanned = 0;
    let updated = 0;
    let empty = 0;
    let listed = 0;

    for (const userId of userIds) {
        scanned += 1;
        const { counts, at } = await snapshotFor(userId);
        if (countsLookEmpty(counts)) {
            empty += 1;
            continue;
        }
        if (dryRun) {
            console.log(`  would write ${userId}`, JSON.stringify(counts));
            updated += 1;
            continue;
        }
        const result = await prideStats.importCounts(userId, counts, { at });
        if (result.error) {
            console.warn(`  fail ${userId}: ${result.error}`);
            continue;
        }
        if (result.listed) listed += 1;
        if (result.wrote > 0) {
            updated += 1;
            console.log(`  updated ${userId} (${result.wrote} keys${result.listed ? ', public' : ''})`);
        }
    }

    console.log('');
    console.log(`Scanned ${scanned}. Wrote ${updated}. Empty ${empty}. Public listed ${listed}.`);
    console.log('Fastest-live boards were not backfilled.');
    await closeDB();
}

main().catch(async (err) => {
    console.error('Pride backfill failed:', err);
    await closeDB();
    process.exit(1);
});
