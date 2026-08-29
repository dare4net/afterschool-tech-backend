const { ObjectId } = require('mongodb');
const { getMainDb, getLessonsDb, client } = require('../config/database');
const { accessCheck } = require('../utils/accessChecker');
const { resolveLessonViewerUserId } = require('../helpers/actorUser');
const { resolveLessonRef } = require('../helpers/lessonRef');

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
  const targetUserId = resolveLessonViewerUserId(req);
  const userIdString = targetUserId ? String(targetUserId) : null;

  console.log('[LESSON] Lesson ID:', lessonId);
  console.log('[LESSON] Target User ID:', targetUserId);

  try {
    const lessonsDb = await getLessonsDb();
    const ref = await resolveLessonRef(lessonId);
    const metaData = ref?.catalog || null;
    const contentData = ref?.content || null;

    if (!contentData) {
      return res.status(404).json({ message: 'Lesson content not found' });
    }

    // 3. Fetch user interaction if userId is available
    let interaction = null;
    if (userIdString) {
      interaction = await lessonsDb.collection('interactions').findOne({
        userId: userIdString,
        lessonId: ref.publicId || contentData.id
      });
    }

    // Combine metadata and content for the viewer
    const response = {
      lesson: {
        ...contentData,
        metadata: metaData || {},
        module_id: metaData?.module_id ? String(metaData.module_id) : contentData.module_id,
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

    const db = await getMainDb();
    const ref = await resolveLessonRef(lessonId);
    const lesson = ref?.catalog || null;

    if (ref?.publicId && lesson) {
      console.log(`[LESSON] Resolved "${lessonId}" → catalog ${lesson._id} (public ${ref.publicId})`);
    }

    if (!lesson) {
      console.error(`[LESSON] Could not resolve lesson ID: ${lessonId}`);
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const earned = Number(req.body?.score);
    const maxScore = Number(req.body?.maxScore);
    const score = Number.isFinite(earned) && earned >= 0 ? earned : 0;
    const possible = Number.isFinite(maxScore) && maxScore >= 0 ? maxScore : 0;

    // Build the completion record with raw points (not a 0–100 percentage)
    const completionFields = {
      score,
      max_score: possible,
      completed_at: new Date(),
      time_spent: req.body.timeSpent
    };

    // Start a session for transaction
    const session = client.startSession();
    let programForProgress = null;
    try {
      await session.withTransaction(async () => {
        // Add to lesson completions
        await db.collection('lesson_completions').updateOne(
          { user_id: userId, lesson_id: lesson._id },
          {
            $set: completionFields,
            $setOnInsert: { user_id: userId, lesson_id: lesson._id },
          },
          { upsert: true, session }
        );

        // Find the program this module belongs to
        programForProgress = await db.collection('programs').findOne(
          { modules: lesson.module_id },
          { projection: { _id: 1, modules: 1 } }
        );

        if (programForProgress) {
          await db.collection('program_registrations').updateOne(
            {
              user_id: userId,
              program_id: programForProgress._id
            },
            {
              $addToSet: { 'progress.completed_lessons': lesson._id },
              $set: { last_activity: new Date() }
            },
            { session }
          );
        }
      });

      // ─── Post-transaction: recalculate percent_complete ───────────────────
      if (programForProgress) {
        try {
          // 1. Get all module ObjectIds for this program
          const moduleObjectIds = (programForProgress.modules || [])
            .map(id => toObjectId(id))
            .filter(Boolean);

          // 2. Get all lessons across all modules in this program
          const allProgramLessons = await db.collection('lessons')
            .find({ module_id: { $in: moduleObjectIds } })
            .project({ _id: 1, module_id: 1 })
            .toArray();

          const totalLessons = allProgramLessons.length;

          if (totalLessons > 0) {
            // 3. Count how many of those lessons this user has completed
            const completedCount = await db.collection('lesson_completions').countDocuments({
              user_id: userId,
              lesson_id: { $in: allProgramLessons.map(l => l._id) }
            });

            const percentComplete = Math.round((completedCount / totalLessons) * 100);

            // 4. Determine which modules are fully completed
            const completedLessonIds = (await db.collection('lesson_completions')
              .find({ user_id: userId, lesson_id: { $in: allProgramLessons.map(l => l._id) } })
              .project({ lesson_id: 1 })
              .toArray()).map(c => c.lesson_id.toString());

            const completedModuleIds = moduleObjectIds.filter(modId => {
              const modLessons = allProgramLessons.filter(l => l.module_id.toString() === modId.toString());
              return modLessons.length > 0 && modLessons.every(l => completedLessonIds.includes(l._id.toString()));
            });

            // 5. Write percent_complete and completed_modules back to the registration
            await db.collection('program_registrations').updateOne(
              { user_id: userId, program_id: programForProgress._id },
              {
                $set: {
                  'progress.percent_complete': percentComplete,
                  'progress.completed_modules': completedModuleIds,
                  last_activity: new Date()
                }
              }
            );

            console.log(`[LESSON] Progress updated: ${completedCount}/${totalLessons} lessons = ${percentComplete}% for program ${programForProgress._id}`);
          }
        } catch (progressErr) {
          // Non-fatal — log and continue, the completion itself was saved
          console.error('[LESSON] Failed to recalculate progress (non-fatal):', progressErr);
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      const response = {
        message: 'Lesson marked as completed',
        completed_at: completionFields.completed_at
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

    // Get the ast_lesson documents from lessonsDb
    const lessonDataObjectIds = lessons
      .filter(l => l.lesson_data)
      .map(l => toObjectId(l.lesson_data))
      .filter(id => id !== null);

    const lessonDataIds = lessons
      .filter(l => l.lesson_data)
      .map(l => l.lesson_data.toString());

    const astLessons = await lessonsDb.collection('lessons')
      .find({
        $or: [
          { _id: { $in: lessonDataObjectIds } },
          { id: { $in: lessonDataIds } }
        ]
      })
      .toArray();

    const astLessonMap = new Map();
    astLessons.forEach(l => {
      astLessonMap.set(l._id.toString(), l);
      if (l.id) astLessonMap.set(l.id, l);
    });

    const lessonDataToAstId = new Map(astLessons.map(l => [l._id.toString(), l.id || l._id.toString()]));

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
      const lessonDataKey = lesson.lesson_data ? lesson.lesson_data.toString() : null;
      const astDoc = lessonDataKey ? astLessonMap.get(lessonDataKey) : null;
      const astLessonId = lessonDataKey ? (astDoc?.id || lessonDataToAstId.get(lessonDataKey) || lessonDataKey) : null;

      const completion = completions.find(c => c.lesson_id.equals(lesson._id));
      const interaction = interactions.find(i => i.lessonId === astLessonId);

      // Summarize slides, categorized components, and total possible points
      const slides = astDoc?.slides || lesson.slides || [];
      const totalSlides = slides.length;

      const categoryCounts = {
        interactive: 0,
        gamified: 0,
        content: 0,
        media: 0,
        structure: 0,
        utility: 0
      };

      const COMPONENT_CATEGORY_MAP = {
        paragraph: 'content', heading: 'content', bulletList: 'content', table: 'content', codeBlock: 'content', quote: 'content',
        divider: 'structure', box: 'structure', callout: 'structure', grid: 'structure', carousel: 'structure', accordion: 'structure', iconBlock: 'structure',
        image: 'media', video: 'media',
        quiz: 'interactive', poll: 'interactive', dragDrop: 'interactive', matchingPairs: 'interactive', fillInTheBlank: 'interactive', codeEditor: 'interactive', clickableImage: 'interactive', hotspot: 'interactive',
        flashcards: 'gamified', badgeReveal: 'gamified', miniGame: 'gamified', progressBar: 'gamified',
        slideTitle: 'structure', lessonIntro: 'structure', lessonSummary: 'structure', lessonComplete: 'structure',
        timer: 'utility', audioPlayer: 'utility', languageToggle: 'utility', themeSwitch: 'utility', hint: 'utility', notePad: 'utility'
      };

      const componentTypesSet = new Set();
      let calculatedTotalScore = 0;

      slides.forEach(slide => {
        (slide.components || []).forEach(comp => {
          if (comp.type) {
            componentTypesSet.add(comp.type);
            const cat = COMPONENT_CATEGORY_MAP[comp.type] || 'content';
            if (categoryCounts[cat] !== undefined) {
              categoryCounts[cat]++;
            }

            // Calculate max points matching ScoringService logic
            const props = comp.props || {};
            const points = props.points || 0;
            const mode = props.mode || comp.mode || 'practice';

            if (points > 0) {
              switch (comp.type) {
                case 'fillInTheBlank':
                  const blankCount = props.blanks?.length || (props.text?.match(/\[blank\]/g) || []).length || 1;
                  calculatedTotalScore += points * blankCount;
                  break;
                case 'matchingPairs':
                  calculatedTotalScore += points * (props.pairs?.length || 1);
                  break;
                case 'quiz':
                  calculatedTotalScore += points * (props.questions?.length || 1);
                  break;
                default:
                  calculatedTotalScore += points;
                  break;
              }
            }
          }
        });
      });

      // Total score prioritizing interaction recorded totalScore, falling back to calculated total
      const totalScore = (interaction?.lessonState?.totalScore && interaction.lessonState.totalScore > 0)
        ? interaction.lessonState.totalScore
        : calculatedTotalScore;

      return {
        ...lesson,
        lessonId: astLessonId, // String ID for viewer redirect
        completed: !!completion,
        progress: completion ? 100 : (interaction?.lessonState?.progress || 0),
        completed_at: completion?.completed_at || null,
        score: completion ? completion.score : (interaction?.lessonState?.score || 0),
        totalScore,
        totalSlides,
        interactiveCount: categoryCounts.interactive + categoryCounts.gamified,
        categoryCounts,
        duration: lesson.duration || astDoc?.duration || 10,
        componentTypes: Array.from(componentTypesSet)
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
      {
        $or: [
          { user_id: userId },
          { user_id: userIdString },
          { user_id: Number(userId) || -1 },
          ...(toObjectId(userId) ? [{ _id: toObjectId(userId) }] : [])
        ]
      },
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

      // Fetch full program document
      const programObjId = toObjectId(programId);
      const program = await mainDb.collection('programs').findOne({
        $or: [
          ...(programObjId ? [{ _id: programObjId }] : []),
          { _id: String(programId) }
        ]
      });

      if (!program || !program.modules?.length) continue;

      // Studio stores programs with 'name' field
      const programName = program.name || program.program_name || program.title || 'Program';

      // Iterate over ALL modules in the program so every module and its cover thumbnail are resolved
      for (const moduleId of program.modules) {
        const moduleObjId = toObjectId(moduleId);

        // Fetch full module document
        const moduleDetails = await mainDb.collection('modules').findOne({
          $or: [
            ...(moduleObjId ? [{ _id: moduleObjId }] : []),
            { _id: String(moduleId) }
          ]
        });

        if (!moduleDetails || !moduleDetails.lessons?.length) continue;

        // Studio stores modules with 'name' field
        const moduleName = moduleDetails.name || moduleDetails.module_name || moduleDetails.title || 'Module';

        console.log(`[LESSON] Module: ${moduleName}, image_url: ${moduleDetails.image_url}, cover_image: ${moduleDetails.cover_image}, program image_url: ${program.image_url}`);

        // 3. Get all lessons from the module (query both ObjectIds and string IDs)
        const lessonObjectIds = moduleDetails.lessons.map(l => toObjectId(l)).filter(Boolean);
        const lessonStringIds = moduleDetails.lessons.map(l => String(l));
        const lessonQueryIds = Array.from(new Set([...lessonObjectIds, ...lessonStringIds]));

        const moduleLessons = await mainDb.collection('lessons')
          .find({ _id: { $in: lessonQueryIds } })
          .toArray();

        const accessibleLessons = moduleLessons;
        if (accessibleLessons.length === 0) continue;

        const lessonDataObjectIds = accessibleLessons
          .filter(lesson => lesson.lesson_data)
          .map(lesson => toObjectId(lesson.lesson_data))
          .filter(id => id !== null);
        const lessonDataStringIds = accessibleLessons
          .filter(lesson => lesson.lesson_data)
          .map(lesson => String(lesson.lesson_data));

        // Get ast_lessons details
        const astLessons = await lessonsDb.collection('lessons')
          .find({ _id: { $in: Array.from(new Set([...lessonDataObjectIds, ...lessonDataStringIds])) } })
          .toArray();

        const lessonIds = astLessons.map(l => l.id);

        // Get interactions
        const interactions = await lessonsDb.collection('interactions')
          .find({
            userId: userIdString,
            lessonId: { $in: lessonIds }
          })
          .toArray();

        // Format lessons
        for (const lesson of accessibleLessons) {
          const astLesson = astLessons.find(l => l._id.toString() === lesson.lesson_data?.toString());
          if (!astLesson) continue;

          const interaction = interactions.find(i => i.lessonId === astLesson.id);

          // Resolve thumbnail with full cascading inheritance (Lesson -> Module -> Program)
          const lessonThumbnail = astLesson?.thumbnail || astLesson?.coverImage || astLesson?.imageUrl || lesson?.thumbnail || lesson?.cover_image || lesson?.image_url || null;
          const moduleThumbnail = moduleDetails?.thumbnail || moduleDetails?.image_url || moduleDetails?.cover_image || moduleDetails?.coverImage || moduleDetails?.imageUrl || null;
          const programThumbnail = program?.thumbnail || program?.image_url || program?.cover_image || program?.coverImage || program?.imageUrl || null;

          let resolvedThumbnail = lessonThumbnail || moduleThumbnail || programThumbnail || null;
          if (resolvedThumbnail && typeof resolvedThumbnail === 'string' && resolvedThumbnail.startsWith('data:image/')) {
            resolvedThumbnail = null;
          }

          allConsolidatedLessons.push({
            ...lesson,
            lessonId: astLesson.id,
            program: programName,
            module: moduleName,
            thumbnail: resolvedThumbnail,
            progress: interaction?.lessonState?.progress || 0,
            lastUpdated: interaction?.lastUpdated || null,
            status: interaction?.lessonState?.progress === 100 ? 'COMPLETED' : (interaction ? 'IN_PROGRESS' : 'NEW')
          });
        }
      }
    }

    // Sort by last activity (lastUpdated descending, then updatedAt descending)
    allConsolidatedLessons.sort((a, b) => {
      const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
      const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
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
