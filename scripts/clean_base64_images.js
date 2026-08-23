const { MongoClient } = require('mongodb');
const { uploadToCloudinary } = require('../helpers/cloudinaryHelper');
require('dotenv').config();

async function cleanBase64Images() {
    console.log('[Migration] Starting Base64 Image Cleanup for MongoDB...');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('afterschooltech');

    const modules = await db.collection('modules').find({}).toArray();
    const programs = await db.collection('programs').find({}).toArray();

    let cleanedModules = 0;
    let cleanedPrograms = 0;

    // 1. Clean Modules
    for (const m of modules) {
        const img = m.image_url || m.cover_image || '';
        if (typeof img === 'string' && img.startsWith('data:image/')) {
            console.log(`\n[Module] Found Base64 image in module "${m.name || m.title || m._id}" (length: ${img.length})`);
            const cloudinaryUrl = await uploadToCloudinary(img, 'ast_thumbnails', `module_${m._id}`);

            const targetUrl = (cloudinaryUrl && !cloudinaryUrl.startsWith('data:image/')) ? cloudinaryUrl : '';
            console.log(`[Module] Uploaded -> ${targetUrl || 'CLEARED (Upload Failed)'}`);

            await db.collection('modules').updateOne(
                { _id: m._id },
                { $set: { image_url: targetUrl, updated_at: new Date() } }
            );
            cleanedModules++;
        }
    }

    // 2. Clean Programs
    for (const p of programs) {
        const img = p.image_url || p.cover_image || '';
        if (typeof img === 'string' && img.startsWith('data:image/')) {
            console.log(`\n[Program] Found Base64 image in program "${p.name || p.program_name || p._id}" (length: ${img.length})`);
            const cloudinaryUrl = await uploadToCloudinary(img, 'ast_thumbnails', `program_${p._id}`);

            const targetUrl = (cloudinaryUrl && !cloudinaryUrl.startsWith('data:image/')) ? cloudinaryUrl : '';
            console.log(`[Program] Uploaded -> ${targetUrl || 'CLEARED (Upload Failed)'}`);

            await db.collection('programs').updateOne(
                { _id: p._id },
                { $set: { image_url: targetUrl, updated_at: new Date() } }
            );
            cleanedPrograms++;
        }
    }

    console.log(`\n[Migration Complete] Cleaned ${cleanedModules} modules and ${cleanedPrograms} programs.`);
    await client.close();
}

cleanBase64Images().catch(console.error);
