const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const db = client.db('afterschooltech');

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

// List all programs (with optional filters)
exports.listPrograms = async (req, res) => {
  try {
    const { search, sort = 'created_at' } = req.query;

    let query = {
      is_deleted: { $ne: true },
      is_published: { $ne: false }
    };

    if (search) {
      query.$or = [
        { program_name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
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

// Get student's registered programs
exports.getMyPrograms = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Get user with their programs array
    const user = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { programs: 1 } }
    );

    if (!user || !user.programs || user.programs.length === 0) {
      return res.json([]);
    }

    // Get full program details including registration info
    const programs = await db.collection('programs')
      .find({ _id: { $in: user.programs } })
      .toArray();

    // Get registration details for these programs
    const registrations = await db.collection('program_registrations')
      .find({
        user_id: userId,
        program_id: { $in: user.programs }
      })
      .toArray();

    // Combine program data with registration details
    const myPrograms = programs.map(program => {
      const registration = registrations.find(reg =>
        reg.program_id.toString() === program._id.toString()
      );

      return {
        ...program,
        registration_date: registration?.registered_at || null,
        progress: registration?.progress || {
          completed_modules: [],
          completed_milestones: [],
          current_module: null
        },
        status: registration?.status || 'active'
      };
    });

    // Sort by registration date, newest first
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

    res.json({
      program_id: programId,
      progress: registration.progress,
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
