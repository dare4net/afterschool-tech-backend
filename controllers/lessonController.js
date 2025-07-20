const { MongoClient, ObjectId } = require('mongodb');
const Redis = require('ioredis');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const mainDb = client.db('afterschooltech');
const lessonsDb = client.db('ast_lessons');

// Initialize Redis client with Upstash
const redis = new Redis(process.env.UPSTASH_REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  },
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

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

// Get lesson details
exports.getLessonDetails = async (req, res) => {
  console.log(`[LESSON] Get Lesson Details called - ${new Date().toISOString()}`);
  console.log('[LESSON] Lesson ID:', req.params.lessonId);
  try {
    const { lessonId } = req.params;
    
    const lesson = await db.collection('lessons').findOne({
      _id: toObjectId(lessonId)
    });

    if (!lesson) {
      const errorResponse = { message: 'Lesson not found' };
      console.log('[LESSON] Error Response:', JSON.stringify(errorResponse, null, 2));
      return res.status(404).json(errorResponse);
    }

    console.log('[LESSON] Success Response:', JSON.stringify(lesson, null, 2));
    res.json(lesson);
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

        // Update user's progress in program_registrations
        await db.collection('program_registrations').updateOne(
          {
            user_id: userId,
            'progress.current_module': lesson.module_id
          },
          {
            $addToSet: { 'progress.completed_lessons': toObjectId(lessonId) },
            $set: { last_activity: new Date() }
          },
          { session }
        );
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

    // Get all lessons for the module
    const lessons = await db.collection('lessons')
      .find({ module_id: toObjectId(moduleId) })
      .sort({ order: 1 })
      .toArray();

    // Get completion status for these lessons
    const completions = await db.collection('lesson_completions')
      .find({
        user_id: userId,
        lesson_id: { $in: lessons.map(l => l._id) }
      })
      .toArray();

    // Combine lesson data with completion status
    const lessonsWithStatus = lessons.map(lesson => ({
      ...lesson,
      completed: completions.some(c => c.lesson_id.equals(lesson._id)),
      completed_at: completions.find(c => c.lesson_id.equals(lesson._id))?.completed_at || null,
      score: completions.find(c => c.lesson_id.equals(lesson._id))?.score || null
    }));

    console.log(`[LESSON] Success Response: Found ${lessonsWithStatus.length} lessons in module`);
    console.log('[LESSON] Response Details:', JSON.stringify(lessonsWithStatus, null, 2));
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
    // 1. Get user's last program from users collection
    const user = await mainDb.collection('users').findOne(
      { user_id: userId },
      { projection: { programs: 1 } }
    );
    
    if (!user?.programs?.length) {
      console.log('[LESSON] No programs found for user');
      return res.json([]);
    }

    const lastProgramId = user.programs[user.programs.length - 1];
    console.log('[LESSON] Last program ID:', lastProgramId);

    // 2. Get the program's last module and program details
    const program = await mainDb.collection('programs').findOne(
      { _id: lastProgramId },
      { projection: { modules: 1, program_name: 1, title: 1 } }
    );

    if (!program?.modules?.length) {
      console.log('[LESSON] No modules found in program');
      return res.json([]);
    }

    const lastModuleId = program.modules[program.modules.length - 1];
    const programName = program.program_name || program.title; // Use either name or title field

    // Get module details including name
    const moduleDetails = await mainDb.collection('modules').findOne(
      { _id: lastModuleId },
      { projection: { module_name: 1, title: 1 } }
    );
    const moduleName = moduleDetails?.module_name || moduleDetails?.title;
    console.log('[LESSON] module name:', moduleName);
    console.log('[LESSON] program name:', programName);
    // 3. Get all lessons from the module with their details
    const module = await mainDb.collection('modules').findOne(
      { _id: lastModuleId },
      { projection: { lessons: 1 } }
    );

    if (!module?.lessons?.length) {
      console.log('[LESSON] No lessons found in module');
      return res.json([]);
    }

    // Get full lesson details including lesson_data
    const moduleLessons = await mainDb.collection('lessons')
      .find({ _id: { $in: module.lessons } })
      .toArray();

    if (!moduleLessons.length) {
      console.log('[LESSON] No lesson details found');
      return res.json([]);
    }

    // Filter lessons based on access permissions
    const accessibleLessons = moduleLessons.filter(lesson => {
      // If no access array is defined, assume it's accessible to everyone
      if (!lesson.access || !Array.isArray(lesson.access) || lesson.access.length === 0) {
        return true;
      }
      
      // Check if lesson is accessible to everyone or specifically to this user
      return lesson.access.includes('everyone') || lesson.access.includes(userIdString);
    });

    console.log(`[LESSON] Found ${moduleLessons.length} lessons in module, ${accessibleLessons.length} accessible to user`);

    const lessonDataObjectIds = accessibleLessons
      .filter(lesson => lesson.lesson_data)
      .map(lesson => toObjectId(lesson.lesson_data))
      .filter(id => id !== null);  // Filter out any failed conversions

    // Get the lessons from ast_lessons to get their proper IDs
    const astLessons = await lessonsDb.collection('lessons')
      .find({ _id: { $in: lessonDataObjectIds } })
      .toArray();
      
    if (!astLessons.length) {
      console.log('[LESSON] No matching lessons found in ast_lessons database');
      return res.json([]);
    }

    // 4. Get existing interactions from ast_lessons database using lesson ids
    const lessonIds = astLessons.map(l => l.id);

    // Try to find interactions using lessonId
    const interactions = await lessonsDb.collection('interactions')
      .find({ 
        userId: userIdString,
        lessonId: { $in: lessonIds }  // Use the id field from ast_lessons to match with lessonId
      })
      .sort({ lastUpdated: -1 })
      .toArray();

    console.log(`[LESSON] Found ${interactions.length} existing interactions`);

    // Strip componentsState from interactions
    const strippedInteractions = interactions.map(({ componentsState, ...rest }) => rest);

    // 5. Find lessons that don't have interactions yet
    const interactedLessonIds = new Set(interactions.map(i => i.lessonId));
    
    // Create a map of lesson_data ObjectId to ast_lessons id for comparison
    const lessonDataToAstId = new Map(
      astLessons.map(l => [l._id.toString(), l.id])
    );

    const newLessons = accessibleLessons.filter(lesson => 
      lesson.lesson_data && !interactedLessonIds.has(lessonDataToAstId.get(lesson.lesson_data.toString()))
    );

    console.log(`[LESSON] Found ${newLessons.length} new lessons`);

    if (newLessons.length > 0) {
      // Add new:true flag to new lessons and format them
      const formattedNewLessons = newLessons.map(lesson => {
        const astLesson = astLessons.find(l => l._id.toString() === lesson.lesson_data.toString());
        if (!astLesson) {
          console.log('[LESSON] Warning: No matching ast_lesson found for lesson:', lesson._id);
          return null;
        }
        return {
          ...lesson,
          new: true,
          lessonId: astLesson.id // Use the id field from ast_lessons
        };
      }).filter(Boolean); // Remove any null entries

      // Add program and module info to all lessons
      const formattedNewLessonsWithInfo = formattedNewLessons.map(lesson => ({
        ...lesson,
        program: programName,
        module: moduleName
      }));

      const strippedInteractionsWithInfo = strippedInteractions.map(interaction => ({
        ...interaction,
        program: programName,
        module: moduleName
      }));

      // Combine interactions with new lessons
      const allLessons = [...strippedInteractionsWithInfo, ...formattedNewLessonsWithInfo];
      console.log(`[LESSON] Returning ${allLessons.length} total lessons (${strippedInteractionsWithInfo.length} in progress, ${formattedNewLessonsWithInfo.length} new)`);
      
      // Store lessons in Redis cache with user-specific key and 1-hour expiration
      const cacheKey = `user:${userIdString}:lessons`;
      try {
        await redis.setex(cacheKey, 3600000, JSON.stringify(allLessons)); // Cache for 1 hour
        console.log('[LESSON] Successfully cached lessons for user:', userIdString);
      } catch (redisError) {
        console.error('[LESSON] Redis caching error:', redisError);
        // Continue even if caching fails
      }
      
      res.json(allLessons);
    } else {
      // Add program and module info to interactions
      const lessonsWithInfo = strippedInteractions.map(interaction => ({
        ...interaction,
        program: programName,
        module: moduleName
      }));
      console.log(`[LESSON] Returning ${lessonsWithInfo.length} lessons (all in progress)`);
      
      // Store lessons in Redis cache with user-specific key and 1-hour expiration
      const cacheKey = `user:${userIdString}:lessons`;
      try {
        await redis.setex(cacheKey, 3600000, JSON.stringify(lessonsWithInfo)); // Cache for 1 hour
        console.log('[LESSON] Successfully cached lessons for user:', userIdString);
      } catch (redisError) {
        console.error('[LESSON] Redis caching error:', redisError);
        // Continue even if caching fails
      }
      
      res.json(lessonsWithInfo);
    }
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
    
    // Check Redis cache
    const cacheKey = `user:${userIdString}:lessons`;
    try {
      const cachedLessons = await redis.get(cacheKey);
      if (cachedLessons) {
        console.log('[LESSON] Returning cached lessons for user:', userIdString);
        return res.json(JSON.parse(cachedLessons));
      }
      
      // If no cached data found
      console.log('[LESSON] No cached lessons found for user:', userIdString);
      return res.json([]);
      
    } catch (redisError) {
      console.error('[LESSON] Redis error:', redisError);
      return res.status(500).json({ 
        error: 'Failed to retrieve cached lessons',
        details: redisError.message 
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};
