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

        res.json(programs);
    } catch (error) {
        console.error('Error fetching programs:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get single program details
exports.getProgram = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;

        const program = await db.collection('programs').findOne({
            _id: toObjectId(id),
            tutor_id: user_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        res.json(program);
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

// Delete program
exports.deleteProgram = async (req, res) => {
    try {
        const db = await getMainDb();
        const { id } = req.params;
        const user_id = req.user.user_id;

        const program = await db.collection('programs').findOne({
            _id: toObjectId(id),
            tutor_id: user_id
        });

        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        // TODO: Also delete associated modules and lessons

        await db.collection('programs').deleteOne({ _id: toObjectId(id) });

        res.json({ message: 'Program deleted successfully' });
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

// Delete module
exports.deleteModule = async (req, res) => {
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

        // TODO: Also delete associated lessons

        // Remove from program's modules array
        await db.collection('programs').updateOne(
            { _id: module.program_id },
            { $pull: { modules: toObjectId(id) } }
        );

        await db.collection('modules').deleteOne({ _id: toObjectId(id) });

        res.json({ message: 'Module deleted successfully' });
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
        const content = await lessonsDb.collection('lessons').findOne({ _id: lesson.lesson_data });

        res.json({
            ...lesson,
            content
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
        if (slides || settings || title) {
            const contentUpdate = { updated_at: new Date() };
            if (title) contentUpdate.title = title;
            if (slides) contentUpdate.slides = slides;
            if (settings) contentUpdate.settings = settings;

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
