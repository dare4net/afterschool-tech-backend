const { ObjectId } = require('mongodb');
const { getMainDb, getLessonsDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Helper to convert string IDs to ObjectId
const toObjectId = (id) => {
    try {
        return new ObjectId(id);
    } catch (error) {
        return null;
    }
};

// ===========================
// PROGRAM CONTROLLERS
// ===========================

// Create a new program
exports.createProgram = async (req, res) => {
    try {
        const db = await getMainDb();
        const user_id = req.user.user_id;

        const { name, description } = req.validatedBody;

        const program = {
            tutor_id: user_id,
            name,
            description: description || '',
            modules: [],
            created_at: new Date(),
            updated_at: new Date()
        };

        const result = await db.collection('programs').insertOne(program);

        res.status(201).json({
            message: 'Program created successfully',
            program: {
                _id: result.insertedId,
                ...program
            }
        });
    } catch (error) {
        console.error('Error creating program:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get all programs for a tutor
exports.getPrograms = async (req, res) => {
    try {
        const db = await getMainDb();
        const user_id = req.user.user_id;

        const programs = await db.collection('programs')
            .find({ tutor_id: user_id })
            .sort({ created_at: -1 })
            .toArray();

        const programIds = programs.map(p => p._id);

        // Fetch all modules for these programs
        const modules = await db.collection('modules')
            .find({ program_id: { $in: programIds } })
            .toArray();

        const moduleIds = modules.map(m => m._id);

        // Aggregate lesson counts per module
        let lessonCountsMap = {};
        if (moduleIds.length > 0) {
            const lessonCounts = await db.collection('lessons').aggregate([
                { $match: { module_id: { $in: moduleIds } } },
                { $group: { _id: "$module_id", count: { $sum: 1 } } }
            ]).toArray();

            lessonCounts.forEach(lc => {
                lessonCountsMap[lc._id.toString()] = lc.count;
            });
        }

        // Map modules to their programs
        const enrichedPrograms = programs.map(program => {
            const programModules = modules.filter(m => m.program_id.toString() === program._id.toString());
            const programLessonsCount = programModules.reduce((acc, m) => acc + (lessonCountsMap[m._id.toString()] || 0), 0);

            return {
                ...program,
                modules: programModules.map(m => ({
                    ...m,
                    lessons_count: lessonCountsMap[m._id.toString()] || 0
                })),
                lessons_count: programLessonsCount
            };
        });

        res.json(enrichedPrograms);
    } catch (error) {
        console.error('Error fetching programs:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get single program details with enrolled student summary
exports.getProgram = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;
        const programObjectId = toObjectId(id);

        const program = await db.collection('programs').findOne({
            _id: programObjectId,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        // Fetch active student registrations with user profiles
        const registrations = await db.collection('program_registrations')
            .find({
                program_id: programObjectId,
                status: { $ne: 'unenrolled' }
            }).toArray();

        // Retrieve actual student names from users collection
        const studentUserIds = registrations
            .map(r => r.student_id || r.user_id)
            .filter(Boolean);

        let studentNamesMap = {};
        if (studentUserIds.length > 0) {
            const ObjectIds = studentUserIds.map(id => toObjectId(id)).filter(Boolean);
            const users = await db.collection('users').find({
                $or: [
                    { _id: { $in: ObjectIds } },
                    { user_id: { $in: studentUserIds } }
                ]
            }).toArray();

            users.forEach(u => {
                const name = u.full_name || u.name ||
                    (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : null) ||
                    u.username || u.email;
                if (name) {
                    if (u._id) studentNamesMap[u._id.toString()] = name;
                    if (u.user_id) studentNamesMap[u.user_id.toString()] = name;
                }
            });
        }

        const enrolled_students = registrations.map((r, idx) => {
            const sid = (r.student_id || r.user_id)?.toString();
            return (sid && studentNamesMap[sid]) || r.student_name || `Student ${idx + 1}`;
        });
        const enrolled_count = enrolled_students.length;

        res.json({
            ...program,
            enrolled_count,
            enrolled_students
        });
    } catch (error) {
        console.error('Error fetching program:', error);
        res.status(500).json({ error: error.message });
    }
};

// Update program
exports.updateProgram = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;
        const updateData = req.validatedBody;

        // Verify ownership
        const program = await db.collection('programs').findOne({
            _id: toObjectId(id),
            tutor_id: user_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        updateData.updated_at = new Date();

        await db.collection('programs').updateOne(
            { _id: toObjectId(id) },
            { $set: updateData }
        );

        res.json({ message: 'Program updated successfully' });
    } catch (error) {
        console.error('Error updating program:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete program (Smart Soft/Hard Cascade Delete)
exports.deleteProgram = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;

        const programObjectId = toObjectId(id);
        const program = await db.collection('programs').findOne({
            _id: programObjectId,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        // Check if students are actively registered for this program
        const activeRegistrations = await db.collection('program_registrations').countDocuments({
            program_id: programObjectId,
            status: { $ne: 'unenrolled' }
        });

        if (activeRegistrations > 0) {
            // Soft delete to protect student records, quiz history, and XP
            await db.collection('programs').updateOne(
                { _id: programObjectId },
                {
                    $set: {
                        is_deleted: true,
                        is_published: false,
                        deleted_at: new Date(),
                        updated_at: new Date()
                    }
                }
            );

            return res.json({
                message: 'Program archived (Soft Delete applied to protect active student records)',
                is_soft_deleted: true
            });
        }

        // Hard Cascade Delete if no enrolled students exist
        const modules = await db.collection('modules')
            .find({ program_id: programObjectId })
            .toArray();

        const moduleIds = modules.map(m => m._id);

        // Delete all associated lessons across all modules
        if (moduleIds.length > 0) {
            await db.collection('lessons').deleteMany({
                module_id: { $in: moduleIds }
            });
        }

        // Delete all modules
        await db.collection('modules').deleteMany({ program_id: programObjectId });

        // Delete the program document itself
        await db.collection('programs').deleteOne({ _id: programObjectId });

        res.json({
            message: 'Program and all associated modules/lessons permanently deleted',
            is_soft_deleted: false
        });
    } catch (error) {
        console.error('Error deleting program:', error);
        res.status(500).json({ error: error.message });
    }
};

// ===========================
// MODULE CONTROLLERS
// ===========================

// Create a module within a program
exports.createModule = async (req, res) => {
    try {
        const db = await getMainDb();
        const { programId } = req.params;
        const user_id = req.user.user_id;
        const { name, description, order } = req.validatedBody;

        // Verify program ownership
        const program = await db.collection('programs').findOne({
            _id: toObjectId(programId),
            tutor_id: user_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        const module = {
            program_id: toObjectId(programId),
            name,
            description: description || '',
            order: order || program.modules.length,
            lessons: [],
            created_at: new Date(),
            updated_at: new Date()
        };

        const result = await db.collection('modules').insertOne(module);

        // Add module to program's modules array
        await db.collection('programs').updateOne(
            { _id: toObjectId(programId) },
            {
                $push: { modules: result.insertedId },
                $set: { updated_at: new Date() }
            }
        );

        res.status(201).json({
            message: 'Module created successfully',
            module: {
                _id: result.insertedId,
                ...module
            }
        });
    } catch (error) {
        console.error('Error creating module:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get all modules for a program
exports.getModules = async (req, res) => {
    try {
        const db = await getMainDb();
        const { programId } = req.params;
        const user_id = req.user.user_id;

        // Verify program ownership
        const program = await db.collection('programs').findOne({
            _id: toObjectId(programId),
            tutor_id: user_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        const modules = await db.collection('modules')
            .find({ program_id: toObjectId(programId) })
            .sort({ order: 1 })
            .toArray();

        res.json(modules);
    } catch (error) {
        console.error('Error fetching modules:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get single module details
exports.getModule = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;

        const module = await db.collection('modules').findOne({ _id: toObjectId(id) });

        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        // Verify program ownership
        const program = await db.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        res.json(module);
    } catch (error) {
        console.error('Error fetching module:', error);
        res.status(500).json({ error: error.message });
    }
};

// Update module
exports.updateModule = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;
        const updateData = req.validatedBody;

        const module = await db.collection('modules').findOne({ _id: toObjectId(id) });

        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        // Verify program ownership
        const program = await db.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        updateData.updated_at = new Date();

        await db.collection('modules').updateOne(
            { _id: toObjectId(id) },
            { $set: updateData }
        );

        res.json({ message: 'Module updated successfully' });
    } catch (error) {
        console.error('Error updating module:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete module (Smart Soft/Hard Cascade Delete)
exports.deleteModule = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;

        const moduleObjectId = toObjectId(id);
        const module = await db.collection('modules').findOne({ _id: moduleObjectId });

        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        // Verify program ownership
        const program = await db.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Check if any student progress exists in lessons of this module
        const moduleLessons = await db.collection('lessons')
            .find({ module_id: moduleObjectId })
            .toArray();

        const lessonIds = moduleLessons.map(l => l._id.toString());

        let hasStudentProgress = false;
        if (lessonIds.length > 0) {
            const progressCount = await db.collection('student_progress').countDocuments({
                lesson_id: { $in: lessonIds }
            });
            hasStudentProgress = progressCount > 0;
        }

        if (hasStudentProgress) {
            // Soft delete module to protect student progress records
            await db.collection('modules').updateOne(
                { _id: moduleObjectId },
                {
                    $set: {
                        is_deleted: true,
                        is_published: false,
                        deleted_at: new Date(),
                        updated_at: new Date()
                    }
                }
            );

            return res.json({
                message: 'Module archived (Soft Delete applied to protect active student records)',
                is_soft_deleted: true
            });
        }

        // Cascade Hard Delete all lessons in this module
        if (lessonIds.length > 0) {
            await db.collection('lessons').deleteMany({
                module_id: moduleObjectId
            });
        }

        // Remove module reference from program's modules array
        await db.collection('programs').updateOne(
            { _id: module.program_id },
            { $pull: { modules: moduleObjectId } }
        );

        // Delete the module document itself
        await db.collection('modules').deleteOne({ _id: moduleObjectId });

        res.json({
            message: 'Module and all associated lessons permanently deleted',
            is_soft_deleted: false
        });
    } catch (error) {
        console.error('Error deleting module:', error);
        res.status(500).json({ error: error.message });
    }
};

// ===========================
// LESSON CONTROLLERS
// ===========================

// Create a lesson within a module
exports.createLesson = async (req, res) => {
    try {
        const mainDb = await getMainDb();
        const lessonsDb = await getLessonsDb();
        const { moduleId } = req.params;
        const user_id = req.user.user_id;
        const { title, description, order, slides, settings } = req.validatedBody;

        // Verify module ownership through program
        const module = await mainDb.collection('modules').findOne({ _id: toObjectId(moduleId) });

        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        const program = await mainDb.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Create lesson content in ast_lessons database
        const lessonContent = {
            id: uuidv4(),
            title,
            slides: slides || [],
            settings: settings || {},
            voice: req.body.voice || 'inherit',
            introAudioUrl: req.body.introAudioUrl || null,
            created_at: new Date(),
            updated_at: new Date()
        };

        const contentResult = await lessonsDb.collection('lessons').insertOne(lessonContent);

        // Create lesson metadata in afterschooltech database
        const lessonMeta = {
            module_id: toObjectId(moduleId),
            lesson_data: contentResult.insertedId,
            title,
            description: description || '',
            order: order || module.lessons.length,
            created_at: new Date(),
            updated_at: new Date()
        };

        const metaResult = await mainDb.collection('lessons').insertOne(lessonMeta);

        // Add lesson to module's lessons array
        await mainDb.collection('modules').updateOne(
            { _id: toObjectId(moduleId) },
            {
                $push: { lessons: metaResult.insertedId },
                $set: { updated_at: new Date() }
            }
        );

        res.status(201).json({
            message: 'Lesson created successfully',
            lesson: {
                _id: metaResult.insertedId,
                ...lessonMeta,
                content: lessonContent
            }
        });
    } catch (error) {
        console.error('Error creating lesson:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get all lessons for a module
exports.getLessons = async (req, res) => {
    try {
        const db = await getMainDb();
        const { moduleId } = req.params;
        const user_id = req.user.user_id;

        // Verify module ownership
        const module = await db.collection('modules').findOne({ _id: toObjectId(moduleId) });

        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        const program = await db.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const lessons = await db.collection('lessons')
            .find({ module_id: toObjectId(moduleId) })
            .sort({ order: 1 })
            .toArray();

        res.json(lessons);
    } catch (error) {
        console.error('Error fetching lessons:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get single lesson with full content
exports.getLesson = async (req, res) => {
    try {
        const mainDb = await getMainDb();
        const lessonsDb = await getLessonsDb();
        const { id } = req.params;
        const user_id = req.user.user_id;

        const lesson = await mainDb.collection('lessons').findOne({ _id: toObjectId(id) });

        if (!lesson) {
            return res.status(404).json({ error: 'Lesson not found' });
        }

        // Verify ownership through module and program
        const module = await mainDb.collection('modules').findOne({ _id: lesson.module_id });
        const program = await mainDb.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Get full lesson content
        const content = await lessonsDb.collection('lessons').findOne({ _id: lesson.lesson_data }) || {};

        // Fetch tutor user info for default author name if not already set on lesson
        let tutorAuthorName = content.author || lesson.author || '';
        if (!tutorAuthorName) {
            const tutorUser = await mainDb.collection('users').findOne({ user_id }, { projection: { full_name: 1, email: 1 } });
            const tutorProfile = await mainDb.collection('tutors').findOne({ user_id }, { projection: { full_name: 1, display_name: 1 } });
            tutorAuthorName = tutorProfile?.display_name || tutorProfile?.full_name || tutorUser?.full_name || tutorUser?.email || '';
        }

        const mergedDescription = lesson.description || content.description || '';
        const mergedVoice = content.voice || lesson.voice || 'inherit';
        const mergedAuthor = content.author || lesson.author || tutorAuthorName;

        res.json({
            ...lesson,
            description: mergedDescription,
            voice: mergedVoice,
            author: mergedAuthor,
            content: {
                ...content,
                description: mergedDescription,
                voice: mergedVoice,
                author: mergedAuthor,
            }
        });
    } catch (error) {
        console.error('Error fetching lesson:', error);
        res.status(500).json({ error: error.message });
    }
};

// Update lesson
exports.updateLesson = async (req, res) => {
    try {
        const mainDb = await getMainDb();
        const lessonsDb = await getLessonsDb();
        const { id } = req.params;
        const user_id = req.user.user_id;
        const { title, description, order, slides, settings } = req.validatedBody;

        const lesson = await mainDb.collection('lessons').findOne({ _id: toObjectId(id) });

        if (!lesson) {
            return res.status(404).json({ error: 'Lesson not found' });
        }

        // Verify ownership
        const module = await mainDb.collection('modules').findOne({ _id: lesson.module_id });
        const program = await mainDb.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Update metadata
        const metaUpdate = {};
        if (title) metaUpdate.title = title;
        if (description !== undefined) metaUpdate.description = description;
        if (order !== undefined) metaUpdate.order = order;
        metaUpdate.updated_at = new Date();

        await mainDb.collection('lessons').updateOne(
            { _id: toObjectId(id) },
            { $set: metaUpdate }
        );

        // Update content if provided
        if (slides || settings || title || req.body.voice !== undefined || req.body.introAudioUrl !== undefined) {
            const contentUpdate = { updated_at: new Date() };
            if (title) contentUpdate.title = title;
            if (slides) contentUpdate.slides = slides;
            if (settings) contentUpdate.settings = settings;
            if (req.body.voice !== undefined) contentUpdate.voice = req.body.voice;
            if (req.body.introAudioUrl !== undefined) contentUpdate.introAudioUrl = req.body.introAudioUrl;

            await lessonsDb.collection('lessons').updateOne(
                { _id: lesson.lesson_data },
                { $set: contentUpdate }
            );
        }

        res.json({ message: 'Lesson updated successfully' });
    } catch (error) {
        console.error('Error updating lesson:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete lesson
exports.deleteLesson = async (req, res) => {
    try {
        const mainDb = await getMainDb();
        const lessonsDb = await getLessonsDb();
        const { id } = req.params;
        const user_id = req.user.user_id;

        const lesson = await mainDb.collection('lessons').findOne({ _id: toObjectId(id) });

        if (!lesson) {
            return res.status(404).json({ error: 'Lesson not found' });
        }

        // Verify ownership
        const module = await mainDb.collection('modules').findOne({ _id: lesson.module_id });
        const program = await mainDb.collection('programs').findOne({
            _id: module.program_id,
            tutor_id: user_id
        });

        if (!program) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Delete lesson content
        await lessonsDb.collection('lessons').deleteOne({ _id: lesson.lesson_data });

        // Remove from module's lessons array
        await mainDb.collection('modules').updateOne(
            { _id: lesson.module_id },
            { $pull: { lessons: toObjectId(id) } }
        );

        // Delete lesson metadata
        await mainDb.collection('lessons').deleteOne({ _id: toObjectId(id) });

        res.json({ message: 'Lesson deleted successfully' });
    } catch (error) {
        console.error('Error deleting lesson:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get list of unique students across tutor's programs
exports.getStudioStudents = async (req, res) => {
    try {
        const db = await getMainDb();
        const user_id = req.user.user_id;

        // 1. Get tutor's programs
        const myPrograms = await db.collection('programs').find({ tutor_id: user_id }).toArray();
        const programIds = myPrograms.map(p => p._id);

        // 2. Get all registrations
        const registrations = await db.collection('program_registrations')
            .find({ program_id: { $in: programIds } })
            .toArray();

        // 3. Get student details
        const uniqueStudentIds = [...new Set(registrations.map(r => r.user_id))];
        const students = await db.collection('users')
            .find({ user_id: { $in: uniqueStudentIds } })
            .project({ fullName: 1, email: 1, user_id: 1, avatar: 1 })
            .toArray();

        // 4. Map students to their registrations with computed last_activity
        const enrichedStudents = students.map(student => {
            const studentRegs = registrations.filter(r => r.user_id === student.user_id);
            let latestActivity = null;

            const myEnrolledPrograms = studentRegs.map(reg => {
                const prog = myPrograms.find(p => p._id.toString() === reg.program_id.toString());
                const regActivity = reg.last_activity || reg.registered_at;
                if (regActivity) {
                    const regDate = new Date(regActivity);
                    if (!latestActivity || regDate > new Date(latestActivity)) {
                        latestActivity = regActivity;
                    }
                }

                return {
                    program_id: reg.program_id,
                    program_name: prog?.program_name || prog?.name || 'Unknown',
                    registered_at: reg.registered_at,
                    last_activity: reg.last_activity,
                    lastActivity: reg.last_activity,
                    progress: reg.progress || {}
                };
            });

            return {
                ...student,
                last_activity: latestActivity,
                lastActivity: latestActivity,
                enrolledPrograms: myEnrolledPrograms,
                totalProgress: myEnrolledPrograms.length > 0
                    ? Math.round(myEnrolledPrograms.reduce((acc, p) => acc + (p.progress.percent_complete || 0), 0) / myEnrolledPrograms.length)
                    : 0
            };
        });

        res.json(enrichedStudents);
    } catch (error) {
        console.error('Error fetching studio students:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get detailed info for a specific student in the tutor's sector
exports.getStudioStudentDetail = async (req, res) => {
    try {
        const db = await getMainDb();
        const tutor_id = req.user.user_id;
        const student_id = req.params.id;

        // 1. Get tutor's programs
        const myPrograms = await db.collection('programs').find({ tutor_id: tutor_id }).toArray();
        const programIds = myPrograms.map(p => p._id);

        // 2. Get student profile
        const student = await db.collection('users').findOne({ user_id: student_id }, { projection: { fullName: 1, email: 1, user_id: 1, avatar: 1 } });

        if (!student) {
            return res.status(404).json({ error: 'Agent not found in sector' });
        }

        // 3. Get student's registrations for tutor's programs
        const registrations = await db.collection('program_registrations')
            .find({
                user_id: student_id,
                program_id: { $in: programIds }
            })
            .toArray();

        let latestActivity = null;

        // 4. Enrich registrations with program names and metadata
        const enrichedRegistrations = registrations.map(reg => {
            const prog = myPrograms.find(p => p._id.toString() === reg.program_id.toString());
            const regActivity = reg.last_activity || reg.registered_at;
            if (regActivity) {
                const regDate = new Date(regActivity);
                if (!latestActivity || regDate > new Date(latestActivity)) {
                    latestActivity = regActivity;
                }
            }

            return {
                ...reg,
                program_name: prog?.program_name || prog?.name || 'Unknown',
                description: prog?.description,
                moduleCount: prog?.modules?.length || 0,
                lastActivity: reg.last_activity,
                last_activity: reg.last_activity
            };
        });

        res.json({
            ...student,
            last_activity: latestActivity,
            lastActivity: latestActivity,
            registrations: enrichedRegistrations,
            sectorSummary: {
                totalEnrolled: enrichedRegistrations.length,
                averageProgress: enrichedRegistrations.length > 0
                    ? Math.round(enrichedRegistrations.reduce((acc, r) => acc + (r.progress?.percent_complete || 0), 0) / enrichedRegistrations.length)
                    : 0
            }
        });
    } catch (error) {
        console.error('Error fetching student detail:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get granular breakdown of a specific student's work in a specific program
exports.getStudioStudentProgramBreakdown = async (req, res) => {
    try {
        const db = await getMainDb();
        const tutor_id = req.user.user_id;
        const student_id = req.params.id;
        const program_id = req.params.programId;

        // 1. Verify program belongs to tutor
        const program = await db.collection('programs').findOne({
            _id: toObjectId(program_id),
            tutor_id: tutor_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found or access denied' });
        }

        // 2. Get student profile
        const student = await db.collection('users').findOne(
            { user_id: student_id },
            { projection: { fullName: 1, email: 1, avatar: 1 } }
        );

        // 3. Get registration data
        const registration = await db.collection('program_registrations').findOne({
            user_id: student_id,
            program_id: toObjectId(program_id)
        });

        if (!registration) {
            return res.status(404).json({ error: 'Agent not registered for this program' });
        }

        // 4. Get all modules and lessons for this program
        const moduleIds = (program.modules || []).map(id => toObjectId(id));
        const modules = await db.collection('modules').find({ _id: { $in: moduleIds } }).toArray();

        const allLessonIds = modules.flatMap(m => (m.lessons || []).map(id => toObjectId(id)));
        const lessons = await db.collection('lessons').find({ _id: { $in: allLessonIds } }).toArray();

        // 5. Get student completions and detailed interactions
        const lessonsDb = await getLessonsDb();

        // Resolve business IDs for interaction lookup
        const lessonDataObjectIds = lessons
            .filter(l => l.lesson_data)
            .map(l => toObjectId(l.lesson_data));

        const astLessons = await lessonsDb.collection('lessons')
            .find({ _id: { $in: lessonDataObjectIds } })
            .project({ _id: 1, id: 1 })
            .toArray();

        const lessonDataToAstId = new Map(astLessons.map(l => [l._id.toString(), l.id]));
        const astLessonIds = Array.from(lessonDataToAstId.values());

        const [completions, interactions] = await Promise.all([
            db.collection('lesson_completions').find({
                user_id: student_id,
                lesson_id: { $in: allLessonIds }
            }).toArray(),
            lessonsDb.collection('interactions').find({
                userId: student_id,
                lessonId: { $in: astLessonIds }
            }).toArray()
        ]);

        // 6. Correlate data
        const sectors = modules.map(mod => {
            const modLessonIds = (mod.lessons || []).map(id => id.toString());
            const modLessons = lessons.filter(l => modLessonIds.includes(l._id.toString()));

            const enrichedLessons = modLessons.map(lesson => {
                const astLessonId = lesson.lesson_data ? lessonDataToAstId.get(lesson.lesson_data.toString()) : null;
                const completion = completions.find(c => c.lesson_id.toString() === lesson._id.toString());
                const interaction = interactions.find(i => i.lessonId === astLessonId);

                return {
                    _id: lesson._id,
                    title: lesson.title,
                    type: lesson.type,
                    status: completion ? 'cleared' : (registration.progress?.current_lesson?.toString() === lesson._id.toString() ? 'active' : 'pending'),
                    progress: completion ? 100 : (interaction?.lessonState?.progress || 0),
                    completedAt: completion?.completed_at,
                    score: completion ? completion.score : (interaction?.lessonState?.score || 0),
                    timeSpent: completion?.time_spent
                };
            });

            const completedCount = enrichedLessons.filter(l => l.status === 'cleared').length;
            const progress = enrichedLessons.length > 0 ? Math.round((completedCount / enrichedLessons.length) * 100) : 0;

            return {
                _id: mod._id,
                name: mod.name || mod.module_name || mod.title || 'Module',
                progress,
                lessons: enrichedLessons
            };
        });

        // 7. Calculate aggregate stats
        const totalLessons = allLessonIds.length;
        const clearedLessons = completions.length;
        const averageScore = completions.length > 0
            ? Math.round(completions.filter(c => c.score !== undefined).reduce((acc, c) => acc + c.score, 0) / (completions.filter(c => c.score !== undefined).length || 1))
            : 0;
        const totalTimeSpent = completions.reduce((acc, c) => acc + (c.time_spent || 0), 0);

        res.json({
            student,
            program: {
                _id: program._id,
                name: program.program_name || program.name,
                description: program.description
            },
            registration: {
                registeredAt: registration.registered_at,
                lastActivity: registration.last_activity,
                overallProgress: registration.progress?.percent_complete || 0
            },
            stats: {
                clearedLessons,
                totalLessons,
                averageScore,
                totalTimeSpent,
                velocity: totalLessons > 0 ? Math.round((clearedLessons / totalLessons) * 100) : 0
            },
            sectors,
            timeline: completions.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).slice(0, 10).map(c => {
                const lesson = lessons.find(l => l._id.toString() === c.lesson_id.toString());
                return {
                    lessonTitle: lesson?.title || 'Unknown Sector',
                    completedAt: c.completed_at,
                    score: c.score
                };
            })
        });
    } catch (error) {
        console.error('Error fetching student program breakdown:', error);
        res.status(500).json({ error: error.message });
    }
};

// ===========================
// ANALYTICS & ACTIVITY
// ===========================

// Get aggregated stats for tutor
exports.getStudioStats = async (req, res) => {
    try {
        const db = await getMainDb();
        const user_id = req.user.user_id;

        // 1. Get tutor's programs
        const myPrograms = await db.collection('programs').find({ tutor_id: user_id }).toArray();
        const programIds = myPrograms.map(p => p._id);

        // 2. Count total students across all these programs
        const registrations = await db.collection('program_registrations')
            .find({ program_id: { $in: programIds } })
            .toArray();

        const uniqueStudentIds = [...new Set(registrations.map(r => r.user_id))];

        // 3. Count total lessons (metadata) across all tutor's programs
        // This requires joining with modules
        const moduleIds = myPrograms.flatMap(p => p.modules || []);
        const totalLessons = await db.collection('lessons').countDocuments({
            module_id: { $in: moduleIds.map(id => toObjectId(id)) }
        });

        res.json({
            totalPrograms: myPrograms.length,
            activeLearners: uniqueStudentIds.length,
            totalLessons,
            engagementRate: 85 // Fixed for now until we have real engagement tracking
        });
    } catch (error) {
        console.error('Error fetching studio stats:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get recent activity across tutor's programs
exports.getStudioActivity = async (req, res) => {
    try {
        const db = await getMainDb();
        const lessonsDb = await getLessonsDb();
        const user_id = req.user.user_id;

        // 1. Get tutor's programs and their lessons
        const myPrograms = await db.collection('programs').find({ tutor_id: user_id }).toArray();
        const programIds = myPrograms.map(p => p._id);

        const modules = await db.collection('modules').find({
            $or: [
                { program_id: { $in: programIds } },
                { _id: { $in: myPrograms.flatMap(p => (p.modules || []).map(id => toObjectId(id))) } }
            ]
        }).toArray();

        const lessons = await db.collection('lessons').find({
            module_id: { $in: modules.map(m => m._id) }
        }).toArray();

        const lessonIds = lessons.map(l => l._id);

        // Resolve business IDs from ast_lessons for interaction lookup
        const lessonDataObjectIds = lessons
            .filter(l => l.lesson_data)
            .map(l => toObjectId(l.lesson_data));

        const astLessons = await lessonsDb.collection('lessons')
            .find({ _id: { $in: lessonDataObjectIds } })
            .project({ _id: 1, id: 1 })
            .toArray();

        const lessonDataToAstId = new Map(astLessons.map(l => [l._id.toString(), l.id]));
        const astLessonIds = Array.from(lessonDataToAstId.values());

        // 2. Fetch parallel activity sources
        const [registrations, completions, interactions] = await Promise.all([
            db.collection('program_registrations').find({ program_id: { $in: programIds } }).sort({ registered_at: -1 }).limit(10).toArray(),
            db.collection('lesson_completions').find({ lesson_id: { $in: lessonIds } }).sort({ completed_at: -1 }).limit(10).toArray(),
            lessonsDb.collection('interactions').find({ lessonId: { $in: astLessonIds } }).sort({ lastUpdated: -1 }).limit(10).toArray()
        ]);

        // 3. Map and unify
        const activityRaw = [
            ...registrations.map(r => ({
                time: r.registered_at,
                type: 'registration',
                user_id: r.user_id,
                meta: { program_id: r.program_id }
            })),
            ...completions.map(c => ({
                time: c.completed_at,
                type: 'completion',
                user_id: c.user_id,
                meta: { lesson_id: c.lesson_id }
            })),
            ...interactions.map(i => ({
                time: i.lastUpdated,
                type: 'interaction',
                user_id: i.userId,
                meta: { lessonId: i.lessonId, progress: i.lessonState?.progress }
            }))
        ];

        // 4. Sort and Enrich
        activityRaw.sort((a, b) => new Date(b.time) - new Date(a.time));
        const limitedActivity = activityRaw.slice(0, 15);

        const enrichedActivity = await Promise.all(limitedActivity.map(async (act) => {
            const student = await db.collection('users').findOne({ user_id: act.user_id }, { projection: { fullName: 1, email: 1 } });
            let action = 'System process detected';

            if (act.type === 'registration') {
                const program = myPrograms.find(p => p._id.toString() === act.meta.program_id.toString());
                action = `Deployed into ${program?.program_name || 'Directive'}`;
            } else if (act.type === 'completion') {
                const lesson = lessons.find(l => l._id.toString() === act.meta.lesson_id.toString());
                action = `Synchronized sector data: ${lesson?.title || 'Sector'}`;
            } else if (act.type === 'interaction') {
                const lesson = lessons.find(l => l.lesson_data?.toString() === act.meta.lessonId);
                action = `Active in ${lesson?.title || 'Sector'} (${act.meta.progress || 0}%)`;
            }

            return {
                ...act,
                user: student?.fullName || student?.email || 'Unknown Agent',
                action,
                type: act.type
            };
        }));

        res.json(enrichedActivity);
    } catch (error) {
        console.error('Error fetching studio activity:', error);
        res.status(500).json({ error: error.message });
    }
};
