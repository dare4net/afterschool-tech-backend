require('dotenv').config();
const { ObjectId } = require('mongodb');
const { getMainDb, closeDB } = require('./config/database');

async function test() {
    const db = await getMainDb();

    // Search for programs by name matching user's examples
    const programs = await db.collection('programs').find({
        $or: [
            { program_name: { $regex: /english/i } },
            { program_name: { $regex: /science/i } },
            { name: { $regex: /english/i } },
            { name: { $regex: /science/i } }
        ]
    }).limit(5).toArray();

    console.log('\n=== PROGRAMS FOUND:', programs.length);
    programs.forEach((p, i) => {
        console.log(`\n--- Program #${i + 1} ---`);
        console.log('  ALL KEYS:', Object.keys(p).join(', '));
        console.log('  name:', p.name);
        console.log('  program_name:', p.program_name);
        console.log('  image_url:', p.image_url);
        console.log('  cover_image:', p.cover_image);
        console.log('  thumbnail:', p.thumbnail);
        console.log('  modules (first 2):', JSON.stringify(p.modules?.slice(0, 2)));
    });

    if (programs.length > 0) {
        const prog = programs[0];
        const moduleIds = prog.modules || [];
        console.log('\n=== FETCHING MODULES FOR:', prog.name || prog.program_name);

        for (const mId of moduleIds.slice(0, 5)) {
            const mod = await db.collection('modules').findOne({
                _id: mId instanceof ObjectId ? mId : new ObjectId(mId.toString())
            });
            if (!mod) { console.log('  Module not found:', mId); continue; }
            console.log(`\n  Module: ${mod.name || mod.module_name}`);
            console.log('  ALL KEYS:', Object.keys(mod).join(', '));
            console.log('  image_url:', mod.image_url);
            console.log('  cover_image:', mod.cover_image);
            console.log('  thumbnail:', mod.thumbnail);
        }
    }

    // Also look for any program with ANY image field
    const anyWithImg = await db.collection('programs').find({
        $or: [
            { image_url: { $exists: true } },
            { cover_image: { $exists: true } },
            { thumbnail: { $exists: true } }
        ]
    }).limit(3).toArray();
    console.log('\n=== PROGRAMS WITH ANY IMAGE FIELD:', anyWithImg.length);
    anyWithImg.forEach(p => {
        console.log('  name:', p.name || p.program_name, '| image_url:', p.image_url, '| cover_image:', p.cover_image, '| thumbnail:', p.thumbnail);
    });

    const anyModWithImg = await db.collection('modules').find({
        $or: [
            { image_url: { $exists: true } },
            { cover_image: { $exists: true } },
            { thumbnail: { $exists: true } }
        ]
    }).limit(3).toArray();
    console.log('\n=== MODULES WITH ANY IMAGE FIELD:', anyModWithImg.length);
    anyModWithImg.forEach(m => {
        console.log('  name:', m.name || m.module_name, '| image_url:', m.image_url, '| cover_image:', m.cover_image, '| thumbnail:', m.thumbnail);
    });

    await closeDB();
}
test().catch(console.error);
