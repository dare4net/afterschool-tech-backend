const { ObjectId } = require('mongodb');
const { getMainDb, getLessonsDb, client } = require('../config/database');
const { accessCheck } = require('../utils/accessChecker');

// Redis disabled
const redis = null;

// Helper function to convert string IDs to ObjectId
const toObjectId = (id) => {
  try {
    return new ObjectId(id);
  } catch (error) {
    return null;
  }
};

// Create a new lesson
exports.createLesson = async (req, res) => {
  console.log(`[LESSON] Create Lesson called - ${new Date().toISOString()}`);
  console.log('[LESSON] Module ID:', req.params.moduleId);
  try {
    const { moduleId } = req.params;
    const {
      title,
      description,
      content,
      type, // 'video', 'text', 'quiz', etc.
      duration,
      order,
      resources = []
    } = req.body;

    const db = await getMainDb();
    const lesson = {
      module_id: toObjectId(moduleId),
      title,
      description,
      content,
      type,
      duration,
      order,
      resources,
      created_at: new Date(),
      updated_at: new Date()
    };

    const result = await db.collection('lessons').insertOne(lesson);

    // Update the module to include this lesson
    await db.collection('modules').updateOne(
      { _id: toObjectId(moduleId) },
      { $push: { lessons: result.insertedId } }
    );

    const response = {
      message: 'Lesson created successfully',
      lesson_id: result.insertedId
    };
    console.log('[LESSON] Create Response:', JSON.stringify(response, null, 2));
    res.status(201).json(response);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get lesson details (full content for viewer)
exports.getLessonDetails = async (req, res) => {
  console.log(`[LESSON] Get Lesson Details called - ${new Date().toISOString()}`);
  const { lessonId } = req.params;
  const userId = req.user?.user_id;
  const userIdString = String(userId);

  console.log('[LESSON] Lesson ID:', lessonId);
  console.log('[LESSON] User ID:', userId);

  try {
    const mainDb = await getMainDb();
    const lessonsDb = await getLessonsDb();

    let metaData = null;
    let contentData = null;

    // 1. Try to find metadata by ObjectId first
    const objectId = toObjectId(lessonId);
    if (objectId) {
      metaData = await mainDb.collection('lessons').findOne({ _id: objectId });
    }

    // 2. Try to find content by string ID if not found or if lessonId is a string
    // If we have metadata, use lesson_data to find content
    if (metaData && metaData.lesson_data) {
      contentData = await lessonsDb.collection('lessons').findOne({
        _id: toObjectId(metaData.lesson_data)
      });
    } else {
      // If no metadata found yet, the lessonId might be the string 'id' from ast_lessons
      contentData = await lessonsDb.collection('lessons').findOne({
        id: lessonId
      });

      // If found content, try to find back the metadata
      if (contentData) {
        metaData = await mainDb.collection('lessons').findOne({
          lesson_data: contentData._id
        });
      }
    }

    if (!contentData) {
      return res.status(404).json({ message: 'Lesson content not found' });
    }

    // 3. Fetch user interaction if userId is available
    let interaction = null;
    if (userId) {
      interaction = await lessonsDb.collection('interactions').findOne({
        userId: userIdString,
        lessonId: contentData.id
      });
    }

    // Combine metadata and content for the viewer
    const response = {
      lesson: {
        ...contentData,
        metadata: metaData || {}
      },
      interaction: interaction
    };

    console.log('[LESSON] Success Response sent for lesson:', contentData.id);
    res.json(response);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update a lesson
exports.updateLesson = async (req, res) => {
  console.log(`[LESSON] Update Lesson called - ${new Date().toISOString()}`);
  console.log('[LESSON] Lesson ID:', req.params.lessonId);
  try {
    const { lessonId } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.module_id;
    delete updateData.created_at;

    updateData.updated_at = new Date();

    const db = await getMainDb();

    const result = await db.collection('lessons').updateOne(
      { _id: toObjectId(lessonId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      const errorResponse = { message: 'Lesson not found' };
      console.log('[LESSON] Error Response:', JSON.stringify(errorResponse, null, 2));
      return res.status(404).json(errorResponse);
    }

    const response = { message: 'Lesson updated successfully' };
    console.log('[LESSON] Success Response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Mark lesson as completed
exports.markLessonCompleted = async (req, res) => {
  console.log(`[LESSON] Mark Lesson Completed called - ${new Date().toISOString()}`);
  console.log('[LESSON] Lesson ID:', req.params.lessonId);
  console.log('[LESSON] User ID:', req.user?.user_id);
  try {
    const { lessonId } = req.params;
    const userId = req.user.user_id;
    const completion = {
      user_id: userId,
      lesson_id: toObjectId(lessonId),
      completed_at: new Date(),
      score: req.body.score, // Optional, for quizzes
      time_spent: req.body.timeSpent // Optional, tracking time spent
    };

    const db = await getMainDb();

    // Find the module this lesson belongs to
    const lesson = await db.collection('lessons').findOne(
      { _id: toObjectId(lessonId) },
      { projection: { module_id: 1 } }
    );

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    // Start a session for transaction
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // Add to lesson completions
        await db.collection('lesson_completions').insertOne(completion, { session });

        // Find the program registration this module belongs to
        const regProgram = await db.collection('programs').findOne(
          { modules: lesson.module_id },
          { projection: { _id: 1 } }
        );

        if (regProgram) {
          await db.collection('program_registrations').updateOne(
            {
              user_id: userId,
              program_id: regProgram._id
            },
            {
              $addToSet: { 'progress.completed_lessons': toObjectId(lessonId) },
              $set: { last_activity: new Date() }
            },
            { session }
          );
        }
      });

      const response = {
        message: 'Lesson marked as completed',
        completed_at: completion.completed_at
      };
      console.log('[LESSON] Success Response:', JSON.stringify(response, null, 2));
      res.json(response);
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get user's completed lessons
exports.getCompletedLessons = async (req, res) => {
  console.log(`[LESSON] Get Completed Lessons called - ${new Date().toISOString()}`);
  console.log('[LESSON] User ID:', req.user?.user_id);
  console.log('[LESSON] Module ID filter:', req.query.moduleId);
  try {
    const userId = req.user.user_id;
    const { moduleId } = req.query;

    const db = await getMainDb();

    let query = { user_id: userId };
    if (moduleId) {
      const moduleLessons = await db.collection('lessons')
        .find({ module_id: toObjectId(moduleId) })
        .project({ _id: 1 })
        .toArray();

      query.lesson_id = {
        $in: moduleLessons.map(l => l._id)
      };
    }

    const completions = await db.collection('lesson_completions')
      .find(query)
      .sort({ completed_at: -1 })
      .toArray();

    // Get lesson details for completed lessons
    const lessonIds = completions.map(c => c.lesson_id);
    const lessons = await db.collection('lessons')
      .find({ _id: { $in: lessonIds } })
      .toArray();

    // Combine completion data with lesson details
    const completedLessons = completions.map(completion => {
      const lesson = lessons.find(l => l._id.equals(completion.lesson_id));
      return {
        ...lesson,
        completed_at: completion.completed_at,
        score: completion.score,
        time_spent: completion.time_spent
      };
    });

    console.log(`[LESSON] Success Response: Found ${completedLessons.length} completed lessons`);
    console.log('[LESSON] Response Details:', JSON.stringify(completedLessons, null, 2));
    res.json(completedLessons);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get module lessons with completion status
exports.getModuleLessons = async (req, res) => {
  console.log(`[LESSON] Get Module Lessons called - ${new Date().toISOString()}`);
  console.log('[LESSON] Module ID:', req.params.moduleId);
  console.log('[LESSON] User ID:', req.user?.user_id);
  try {
    const { moduleId } = req.params;
    const userId = req.user.user_id;

    const db = await getMainDb();
    const lessonsDb = await getLessonsDb();

    // Get all lessons for the module from mainDb
    const lessons = await db.collection('lessons')
      .find({ module_id: toObjectId(moduleId) })
      .sort({ order: 1 })
      .toArray();

    if (lessons.length === 0) {
      return res.json([]);
    }

    // Get the ast_lesson string IDs from lessonsDb
    const lessonDataObjectIds = lessons
      .filter(l => l.lesson_data)
      .map(l => toObjectId(l.lesson_data))
      .filter(id => id !== null);

    const astLessons = await lessonsDb.collection('lessons')
      .find({ _id: { $in: lessonDataObjectIds } })
      .project({ _id: 1, id: 1 })
      .toArray();

    const lessonDataToAstId = new Map(astLessons.map(l => [l._id.toString(), l.id]));

    // Get completion status for these lessons
    const completions = await db.collection('lesson_completions')
      .find({
        user_id: userId,
        lesson_id: { $in: lessons.map(l => l._id) }
      })
      .toArray();

    // Get granular interactions to show partial progress
    const interactions = await lessonsDb.collection('interactions').find({
      userId: userId,
      lessonId: { $in: Array.from(lessonDataToAstId.values()) }
    }).toArray();

    // Combine lesson data with completion status and ast ID
    const lessonsWithStatus = lessons.map(lesson => {
      const astLessonId = lesson.lesson_data ? lessonDataToAstId.get(lesson.lesson_data.toString()) : null;
      const completion = completions.find(c => c.lesson_id.equals(lesson._id));
      const interaction = interactions.find(i => i.lessonId === astLessonId);

      return {
        ...lesson,
        lessonId: astLessonId, // String ID for viewer redirect
        completed: !!completion,
        progress: completion ? 100 : (interaction?.lessonState?.progress || 0),
        completed_at: completion?.completed_at || null,
        score: completion ? completion.score : (interaction?.lessonState?.score || 0)
      };
    });

    console.log(`[LESSON] Success Response: Found ${lessonsWithStatus.length} lessons in module`);
    res.json(lessonsWithStatus);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all lesson interactions for a user
exports.getAllLessonsByUser = async (req, res) => {
  console.log(`[LESSON] Get All Lessons By User called - ${new Date().toISOString()}`);
  console.log('[LESSON] User ID:', req.user?.user_id);
  try {
    const userId = req.user.user_id;
    const userIdString = String(userId);
    const mainDb = await getMainDb();
    const lessonsDb = await getLessonsDb();

    // 1. Get user's programs from users collection
    const user = await mainDb.collection('users').findOne(
      { user_id: userId },
      { projection: { programs: 1 } }
    );

    if (!user?.programs?.length) {
      console.log('[LESSON] No programs found for user');
      return res.json([]);
    }

    const allConsolidatedLessons = [];

    // 2. Iterate through all programs
    for (const programId of user.programs) {
      console.log('[LESSON] Processing program:', programId);

      const program = await mainDb.collection('programs').findOne(
        { _id: toObjectId(programId) },
        { projection: { modules: 1, program_name: 1, title: 1 } }
      );

      if (!program?.modules?.length) continue;

      const programName = program.program_name || program.title;

      // Use registration to find the active module, fallback to the first module
      const registration = await mainDb.collection('program_registrations').findOne({
        user_id: userId,
        program_id: toObjectId(programId)
      });

      const activeModuleId = (registration?.progress?.current_module)
        ? toObjectId(registration.progress.current_module)
        : toObjectId(program.modules[0]);

      if (!activeModuleId) continue;

      const moduleDetails = await mainDb.collection('modules').findOne(
        { _id: activeModuleId },
        { projection: { module_name: 1, title: 1, lessons: 1 } }
      );

      if (!moduleDetails?.lessons?.length) continue;

      const moduleName = moduleDetails.module_name || moduleDetails.title;

      // 3. Get all lessons from the module
      const moduleLessons = await mainDb.collection('lessons')
        .find({ _id: { $in: moduleDetails.lessons } })
        .toArray();

      // Use moduleLessons directly (no access check needed once registered for program)
      const accessibleLessons = moduleLessons;
      if (accessibleLessons.length === 0) continue;

      const lessonDataObjectIds = accessibleLessons
        .filter(lesson => lesson.lesson_data)
        .map(lesson => toObjectId(lesson.lesson_data))
        .filter(id => id !== null);

      // Get ast_lessons details
      const astLessons = await lessonsDb.collection('lessons')
        .find({ _id: { $in: lessonDataObjectIds } })
        .toArray();

      const lessonIds = astLessons.map(l => l.id);

      // Get interactions
      const interactions = await lessonsDb.collection('interactions')
        .find({
          userId: userIdString,
          lessonId: { $in: lessonIds }
        })
        .toArray();

      const interactedLessonIds = new Set(interactions.map(i => i.lessonId));
      const lessonDataToAstId = new Map(astLessons.map(l => [l._id.toString(), l.id]));

      // Format lessons
      for (const lesson of accessibleLessons) {
        const astLesson = astLessons.find(l => l._id.toString() === lesson.lesson_data?.toString());
        if (!astLesson) continue;

        const interaction = interactions.find(i => i.lessonId === astLesson.id);

        allConsolidatedLessons.push({
          ...lesson,
          lessonId: astLesson.id,
          program: programName,
          module: moduleName,
          progress: interaction?.lessonState?.progress || 0,
          lastUpdated: interaction?.lastUpdated || null,
          status: interaction?.lessonState?.progress === 100 ? 'COMPLETED' : (interaction ? 'IN_PROGRESS' : 'NEW')
        });
      }
    }

    // Sort by last activity (updatedAt descending)
    allConsolidatedLessons.sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    console.log(`[LESSON] Returning ${allConsolidatedLessons.length} consolidated lessons from ${user.programs.length} programs`);

    // Cache results
    if (redis) {
      const cacheKey = `user:${userIdString}:lessons`;
      try {
        await redis.setex(cacheKey, 3600, JSON.stringify(allConsolidatedLessons));
      } catch (err) { }
    }

    res.json(allConsolidatedLessons);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get cached lessons for a user without database queries
exports.getCachedLessonsByUser = async (req, res) => {
  console.log(`[LESSON] Get Cached Lessons By User called - ${new Date().toISOString()}`);
  console.log('[LESSON] User ID:', req.user?.user_id);

  try {
    const userId = req.user.user_id;
    const userIdString = String(userId);

    // Check Redis cache if available
    if (redis) {
      const cacheKey = `user:${userIdString}:lessons`;
      try {
        const cachedLessons = await redis.get(cacheKey);
        if (cachedLessons) {
          console.log('[LESSON] Returning cached lessons for user:', userIdString);
          return res.json(JSON.parse(cachedLessons));
        }
      } catch (redisError) {
        console.error('[LESSON] Redis error:', redisError);
        // Fall back to empty result if redis fails
      }
    }

    // If no cached data found or redis disabled
    console.log('[LESSON] No cached lessons found for user:', userIdString);
    return res.json([]);

  } catch (error) {
    console.error('Error in getCachedLessonsByUser:', error);
    res.status(500).json({ error: error.message });
  }
};
