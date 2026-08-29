/**
 * Assign a first-name handle and make every private user public.
 *
 * Reuses a valid existing handle. Otherwise slugs the first word of
 * full_name / name. Collisions become maya2, maya3, …
 * Never uses email. Then sets isPublicProfile and lists pride ranks.
 *
 *   node scripts/assign-public-handles.js
 *   node scripts/assign-public-handles.js --dry-run
 *   node scripts/assign-public-handles.js --user=Ab12Cd
 */

require('dotenv').config();
const { getMainDb, closeDB } = require('../config/database');
const usersRepo = require('../repositories/usersRepo');
const { createPrideStats } = require('../helpers/prideStats');
const { handleError, allocateHandleFromName } = require('../helpers/publicProfile');

function parseArgs(argv) {
    const dryRun = argv.includes('--dry-run');
    const userArg = argv.find((item) => item.startsWith('--user='));
    const onlyUser = userArg ? userArg.slice('--user='.length).trim() : '';
    return { dryRun, onlyUser };
}

function displayName(user) {
    return user.full_name || user.name || '';
}

async function main() {
    const { dryRun, onlyUser } = parseArgs(process.argv.slice(2));
    await usersRepo.ensureIndexes();
    const db = await getMainDb();
    const prideStats = createPrideStats();

    const query = onlyUser
        ? { user_id: onlyUser }
        : { $or: [{ isPublicProfile: { $ne: true } }, { isPublicProfile: { $exists: false } }] };

    const users = await db.collection('users').find(query, {
        projection: { password_hash: 0, email: 0 },
    }).toArray();

    const taken = new Set(
        (await db.collection('users').distinct('handle')).filter(Boolean).map((item) => String(item).toLowerCase())
    );

    console.log('Assign public handles');
    console.log(`  private users: ${users.length}${onlyUser ? ` (filter ${onlyUser})` : ''}`);
    console.log(`  dry-run: ${dryRun ? 'yes' : 'no'}`);
    console.log('');

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
        const userId = user.user_id;
        if (!userId) {
            skipped += 1;
            continue;
        }
        if (user.isPublicProfile === true && user.handle && !handleError(user.handle)) {
            skipped += 1;
            continue;
        }

        let handle;
        try {
            handle = allocateHandleFromName(displayName(user), taken, {
                existingHandle: user.handle,
                userId,
            });
        } catch (err) {
            failed += 1;
            console.warn(`  fail ${userId}: ${err.message}`);
            continue;
        }

        taken.add(handle);
        if (dryRun) {
            updated += 1;
            console.log(`  would set ${userId} → @${handle}`);
            continue;
        }

        try {
            await usersRepo.updateIdentity(userId, {
                handle,
                isPublicProfile: true,
            });
            await prideStats.setListed(userId, true);
            updated += 1;
            console.log(`  public ${userId} → @${handle}`);
        } catch (err) {
            taken.delete(handle);
            failed += 1;
            console.warn(`  fail ${userId}: ${err.message}`);
        }
    }

    console.log('');
    console.log(`Updated ${updated}. Skipped ${skipped}. Failed ${failed}.`);
    await closeDB();
}

main().catch(async (err) => {
    console.error('Assign public handles failed:', err);
    await closeDB();
    process.exit(1);
});
