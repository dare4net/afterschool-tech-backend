const { ObjectId } = require('mongodb');
const { getMainDb, client } = require('../config/database');
const curriculumDrops = require('../helpers/curriculumDrops');
const { marketplaceCatalogFilter } = require('../helpers/programVisibility');

// Helper function to convert string IDs to ObjectId
const toObjectId = (id) => {
  try {
    return new ObjectId(id);
  } catch (error) {
    return null;
  }
};

// Helper function to recursively fetch modules and milestones
async function fetchProgramDetails(programId) {
  const db = await getMainDb();
  const program = await db.collection('programs').findOne({ _id: toObjectId(programId) });
  if (!program) return null;

  // Fetch modules
  if (program.modules && program.modules.length > 0) {
    const moduleIds = program.modules.map(id => toObjectId(id));
    const modules = await db.collection('modules')
      .find({ _id: { $in: moduleIds } })
      .toArray();

    // For each module, fetch its lessons and milestones
    for (let module of modules) {
      if (module.milestones && module.milestones.length > 0) {
        const milestoneIds = module.milestones.map(id => toObjectId(id));
        module.milestones = await db.collection('milestones')
          .find({ _id: { $in: milestoneIds } })
          .toArray();
      }
    }
    program.modules = modules;
  }

  // Fetch program milestones
  if (program.milestones && program.milestones.length > 0) {
    const milestoneIds = program.milestones.map(id => toObjectId(id));
    program.milestones = await db.collection('milestones')
      .find({ _id: { $in: milestoneIds } })
      .toArray();
  }

  return program;
}

// Get program details with all related data
exports.getProgramDetails = async (req, res) => {
  try {
    const { programId } = req.params;

    const program = await fetchProgramDetails(programId);

    if (!program) {
      return res.status(404).json({ message: 'Program not found' });
    }

    res.json(program);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Register a student for a program
exports.registerForProgram = async (req, res) => {
  try {
    const db = await getMainDb();
    const { programId } = req.params;
    const userId = req.user.user_id; // From auth middleware
    const programObjectId = toObjectId(programId);

    // Verify program exists
    const program = await db.collection('programs').findOne({
      _id: programObjectId
    });

    if (!program) {
      return res.status(404).json({ message: 'Program not found' });
    }

    // Check if already registered
    const existingRegistration = await db.collection('program_registrations').findOne({
      program_id: programObjectId,
      user_id: userId
    });

    if (existingRegistration) {
      return res.status(400).json({ message: 'Already registered for this program' });
    }

    // Create registration
    const registration = {
      program_id: programObjectId,
      user_id: userId,
      status: 'active',
      progress: {
        completed_modules: [],
        completed_milestones: [],
        current_module: program.modules && program.modules.length > 0 ? toObjectId(program.modules[0]) : null
      },
      registered_at: new Date(),
      last_activity: new Date()
    };

    // Start a session for transaction
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // Insert registration
        await db.collection('program_registrations').insertOne(registration, { session });

        // Update user's programs array
        await db.collection('users').updateOne(
          { user_id: userId },
          {
            $addToSet: { programs: programObjectId } // $addToSet ensures no duplicates
          },
          { session }
        );
      });

      res.status(201).json({
        message: 'Successfully registered for program',
        registration_id: registration._id
      });
    } finally {
      await session.endSession();
    }

  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function programTitle(program) {
  return (program && (program.program_name || program.name || program.title)) || 'Course';
}

function moduleTitle(mod) {
  return (mod && (mod.title || mod.name || mod.module_name || mod.moduleTitle)) || 'Module';
}

function lessonTitle(lesson) {
  return (lesson && (lesson.title || lesson.name || lesson.lesson_title)) || 'Lesson';
}

exports.searchCurriculum = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) {
      return res.json({ success: true, programs: [], modules: [], lessons: [] });
    }

    const db = await getMainDb();
    const regex = new RegExp(escapeRegex(q), 'i');
    const published = { is_deleted: { $ne: true }, is_published: { $ne: false } };

    const programs = await db.collection('programs')
      .find({
        ...published,
        $or: [
          { program_name: regex },
          { name: regex },
          { title: regex },
        ],
      })
      .project({ program_name: 1, name: 1, title: 1 })
      .limit(8)
      .toArray();

    const modules = await db.collection('modules')
      .find({
        ...published,
        $or: [
          { title: regex },
          { name: regex },
          { module_name: regex },
          { moduleTitle: regex },
        ],
      })
      .project({ title: 1, name: 1, module_name: 1, moduleTitle: 1, program_id: 1 })
      .limit(8)
      .toArray();

    const lessons = await db.collection('lessons')
      .find({
        ...published,
        $or: [
          { title: regex },
          { name: regex },
          { lesson_title: regex },
        ],
      })
      .project({ title: 1, name: 1, lesson_title: 1, module_id: 1, lesson_data: 1 })
      .limit(8)
      .toArray();

    const programById = new Map(programs.map((row) => [String(row._id), row]));
    const neededProgramIds = new Set();
    const neededModuleIds = new Set();

    for (const mod of modules) {
      if (mod.program_id) neededProgramIds.add(String(mod.program_id));
      else neededProgramIds.add(`module:${mod._id}`);
    }
    for (const lesson of lessons) {
      if (lesson.module_id) neededModuleIds.add(String(lesson.module_id));
    }

    const orphanModuleIds = modules.filter((mod) => !mod.program_id).map((mod) => mod._id);
    if (orphanModuleIds.length) {
      const parents = await db.collection('programs')
        .find({ modules: { $in: orphanModuleIds }, ...published })
        .project({ program_name: 1, name: 1, title: 1, modules: 1 })
        .toArray();
      for (const parent of parents) {
        programById.set(String(parent._id), parent);
        for (const mid of parent.modules || []) {
          const key = String(mid);
          if (!programById.has(`module-parent:${key}`)) {
            programById.set(`module-parent:${key}`, parent);
          }
        }
      }
    }

    const missingProgramIds = [...neededProgramIds]
      .filter((id) => !id.startsWith('module:') && !programById.has(id))
      .map((id) => toObjectId(id))
      .filter(Boolean);
    if (missingProgramIds.length) {
      const extra = await db.collection('programs')
        .find({ _id: { $in: missingProgramIds }, ...published })
        .project({ program_name: 1, name: 1, title: 1 })
        .toArray();
      extra.forEach((row) => programById.set(String(row._id), row));
    }

    const moduleById = new Map(modules.map((row) => [String(row._id), row]));
    const missingModuleIds = [...neededModuleIds]
      .filter((id) => !moduleById.has(id))
      .map((id) => toObjectId(id))
      .filter(Boolean);
    if (missingModuleIds.length) {
      const extraMods = await db.collection('modules')
        .find({ _id: { $in: missingModuleIds }, ...published })
        .project({ title: 1, name: 1, module_name: 1, moduleTitle: 1, program_id: 1 })
        .toArray();
      extraMods.forEach((row) => moduleById.set(String(row._id), row));
      const extraProgramIds = extraMods
        .map((row) => row.program_id)
        .filter((id) => id && !programById.has(String(id)))
        .map((id) => toObjectId(id))
        .filter(Boolean);
      if (extraProgramIds.length) {
        const extraPrograms = await db.collection('programs')
          .find({ _id: { $in: extraProgramIds }, ...published })
          .project({ program_name: 1, name: 1, title: 1 })
          .toArray();
        extraPrograms.forEach((row) => programById.set(String(row._id), row));
      }
    }

    const resolveProgramForModule = (mod) => {
      if (!mod) return null;
      if (mod.program_id && programById.has(String(mod.program_id))) {
        return programById.get(String(mod.program_id));
      }
      return programById.get(`module-parent:${mod._id}`) || null;
    };

    res.json({
      success: true,
      programs: programs.map((program) => ({
        id: String(program._id),
        title: programTitle(program),
        href: `/dashboard/student/programs/${program._id}`,
      })),
      modules: modules.map((mod) => {
        const program = resolveProgramForModule(mod);
        const programId = program ? String(program._id) : (mod.program_id ? String(mod.program_id) : null);
        if (!programId) return null;
        return {
          id: String(mod._id),
          title: moduleTitle(mod),
          programTitle: program ? programTitle(program) : 'Course',
          href: `/dashboard/student/programs/${programId}/modules/${mod._id}`,
        };
      }).filter(Boolean),
      lessons: lessons.map((lesson) => {
        const mod = lesson.module_id ? moduleById.get(String(lesson.module_id)) : null;
        const program = resolveProgramForModule(mod);
        const programId = program ? String(program._id) : (mod && mod.program_id ? String(mod.program_id) : null);
        const moduleId = lesson.module_id ? String(lesson.module_id) : null;
        if (!programId || !moduleId) return null;
        return {
          id: String(lesson._id),
          title: lessonTitle(lesson),
          moduleTitle: mod ? moduleTitle(mod) : 'Module',
          programTitle: program ? programTitle(program) : 'Course',
          href: `/dashboard/student/programs/${programId}/modules/${moduleId}`,
        };
      }).filter(Boolean),
    });
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// List all programs (with optional filters)
exports.listPrograms = async (req, res) => {
  try {
    const db = await getMainDb();
    const { search, sort = 'created_at' } = req.query;

    let query = {
      is_deleted: { $ne: true },
      is_published: { $ne: false },
      $and: [marketplaceCatalogFilter()],
    };

    if (search) {
      query.$and.push({
        $or: [
          { program_name: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const sortOptions = {};
    sortOptions[sort] = -1; // Default to descending

    const programs = await db.collection('programs')
      .find(query)
      .sort(sortOptions)
      .toArray();

    res.json(programs);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get student's registered programs (optional ?org_id= club scope, or org_id=personal)
exports.getMyPrograms = async (req, res) => {
  try {
    const db = await getMainDb();
    const userId = req.user.user_id;
    const rawOrgId = req.query.org_id ? String(req.query.org_id).trim() : '';

    // Prefer registrations as source of truth (supports org_id / cohort attribution)
    let regQuery = {
      user_id: userId,
      status: { $ne: 'unenrolled' },
    };
    if (rawOrgId === 'personal') {
      regQuery.$or = [{ org_id: null }, { org_id: { $exists: false } }];
    } else if (rawOrgId) {
      const oid = toObjectId(rawOrgId);
      regQuery.org_id = oid ? { $in: [oid, rawOrgId, String(oid)] } : rawOrgId;
    }

    const registrations = await db.collection('program_registrations')
      .find(regQuery)
      .toArray();

    let programIds = registrations
      .map((reg) => reg.program_id)
      .filter(Boolean);

    // Legacy fallback: users.programs when no scoped filter and no regs yet
    if (!programIds.length && !rawOrgId) {
      const user = await db.collection('users').findOne(
        { user_id: userId },
        { projection: { programs: 1 } }
      );
      if (!user || !user.programs || user.programs.length === 0) {
        return res.json([]);
      }
      programIds = user.programs;
    }

    if (!programIds.length) {
      return res.json([]);
    }

    const programs = await db.collection('programs')
      .find({ _id: { $in: programIds } })
      .toArray();

    const myPrograms = [];
    for (const program of programs) {
      const registration = registrations.find(reg =>
        reg.program_id && reg.program_id.toString() === program._id.toString()
      ) || await db.collection('program_registrations').findOne({
        user_id: userId,
        program_id: program._id,
      });
      const stored = registration?.progress || {
        completed_modules: [],
        completed_milestones: [],
        current_module: null
      };
      const live = await curriculumDrops.progressForUser(userId, program._id);
      myPrograms.push({
        ...program,
        org_id: registration?.org_id || program.org_id || null,
        cohort_id: registration?.cohort_id || null,
        registration_date: registration?.registered_at || null,
        progress: live ? { ...stored, ...live } : stored,
        status: registration?.status || 'active'
      });
    }

    myPrograms.sort((a, b) =>
      (b.registration_date || 0) - (a.registration_date || 0)
    );

    res.json(myPrograms);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get user's progress for a specific program
exports.getMyProgramProgress = async (req, res) => {
  try {
    const db = await getMainDb();
    const { programId } = req.params;
    const userId = req.user.user_id;

    // Find the registration for this program
    const registration = await db.collection('program_registrations').findOne({
      program_id: toObjectId(programId),
      user_id: userId
    });

    if (!registration) {
      return res.status(404).json({
        message: 'No registration found for this program'
      });
    }

    const live = await curriculumDrops.progressForUser(userId, programId);
    const progress = live ? { ...registration.progress, ...live } : registration.progress;

    res.json({
      program_id: programId,
      progress,
      status: registration.status,
      last_activity: registration.last_activity
    });

  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Unregister/Leave a program (Resets progress)
exports.unregisterFromProgram = async (req, res) => {
  try {
    const db = await getMainDb();
    const { programId } = req.params;
    const userId = req.user.user_id;
    const programObjectId = toObjectId(programId);

    if (!programObjectId) {
      return res.status(400).json({ message: 'Invalid program ID' });
    }

    // Start a session for transaction
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // 1. Remove from program_registrations
        await db.collection('program_registrations').deleteOne({
          program_id: programObjectId,
          user_id: userId
        }, { session });

        // 2. Remove from user's programs array
        await db.collection('users').updateOne(
          { user_id: userId },
          { $pull: { programs: programObjectId } },
          { session }
        );

        // 3. Reset lesson progress for this program
        const program = await db.collection('programs').findOne({ _id: programObjectId }, { session });
        if (program?.modules) {
          const modules = await db.collection('modules').find({ _id: { $in: program.modules.map(id => toObjectId(id)) } }, { session }).toArray();
          const lessonIds = modules.flatMap(m => m.lessons || []).map(id => toObjectId(id));

          if (lessonIds.length > 0) {
            await db.collection('lesson_completions').deleteMany({
              user_id: userId,
              lesson_id: { $in: lessonIds }
            }, { session });
          }
        }
      });

      res.status(200).json({ message: 'Successfully unregistered from program. Progress has been reset.' });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};
