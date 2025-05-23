const pool = require('../config/db');

// User Management
exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const [user] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, full_name, role, organization_id } = req.body;
    await pool.query(
      'UPDATE users SET email = ?, full_name = ?, role = ?, organization_id = ? WHERE id = ?',
      [email, full_name, role, organization_id, userId]
    );
    res.json({ message: 'User updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Student Management
exports.getAllStudents = async (req, res) => {
  try {
    const [students] = await pool.query('SELECT * FROM students');
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStudentById = async (req, res) => {
  try {
    const { studentId } = req.params;
    const [student] = await pool.query('SELECT * FROM students WHERE user_id = ?', [studentId]);
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const { email, full_name, birth_date, level, organization_id } = req.body;
    const [result] = await pool.query(
      'INSERT INTO students (email, full_name, birth_date, level, organization_id) VALUES (?, ?, ?, ?, ?)',
      [email, full_name, birth_date, level, organization_id]
    );
    res.status(201).json({ student_id: result.insertId, message: 'Student created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { email, full_name, birth_date, level, organization_id } = req.body;
    await pool.query(
      'UPDATE students SET email = ?, full_name = ?, birth_date = ?, level = ?, organization_id = ? WHERE user_id = ?',
      [email, full_name, birth_date, level, organization_id, studentId]
    );
    res.json({ message: 'Student updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    await pool.query('DELETE FROM students WHERE user_id = ?', [studentId]);
    res.json({ message: 'Student deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Program Management
exports.getAllPrograms = async (req, res) => {
  try {
    const [programs] = await pool.query('SELECT * FROM programs');
    res.json(programs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProgramById = async (req, res) => {
  try {
    const { programId } = req.params;
    const [program] = await pool.query('SELECT * FROM programs WHERE id = ?', [programId]);
    res.json(program);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createProgram = async (req, res) => {
  try {
    const { name, description, start_date, end_date } = req.body;
    const [result] = await pool.query(
      'INSERT INTO programs (name, description, start_date, end_date) VALUES (?, ?, ?, ?)',
      [name, description, start_date, end_date]
    );
    res.status(201).json({ program_id: result.insertId, message: 'Program created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const { name, description, start_date, end_date } = req.body;
    await pool.query(
      'UPDATE programs SET name = ?, description = ?, start_date = ?, end_date = ? WHERE id = ?',
      [name, description, start_date, end_date, programId]
    );
    res.json({ message: 'Program updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    await pool.query('DELETE FROM programs WHERE id = ?', [programId]);
    res.json({ message: 'Program deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Module Management
exports.getAllModules = async (req, res) => {
  try {
    const [modules] = await pool.query('SELECT * FROM modules');
    res.json(modules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getModuleById = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const [module] = await pool.query('SELECT * FROM modules WHERE id = ?', [moduleId]);
    res.json(module);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createModule = async (req, res) => {
  try {
    const { program_id, name, description } = req.body;
    const [result] = await pool.query(
      'INSERT INTO modules (program_id, name, description) VALUES (?, ?, ?)',
      [program_id, name, description]
    );
    res.status(201).json({ module_id: result.insertId, message: 'Module created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateModule = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { name, description } = req.body;
    await pool.query(
      'UPDATE modules SET name = ?, description = ? WHERE id = ?',
      [name, description, moduleId]
    );
    res.json({ message: 'Module updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteModule = async (req, res) => {
  try {
    const { moduleId } = req.params;
    await pool.query('DELETE FROM modules WHERE id = ?', [moduleId]);
    res.json({ message: 'Module deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Achievement Management
exports.getAllAchievements = async (req, res) => {
  try {
    const [achievements] = await pool.query('SELECT * FROM achievements_library');
    res.json(achievements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAchievementById = async (req, res) => {
  try {
    const { achievementId } = req.params;
    const [achievement] = await pool.query('SELECT * FROM achievements_library WHERE id = ?', [achievementId]);
    res.json(achievement);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createAchievement = async (req, res) => {
  try {
    const { name, type, description, criteria } = req.body;
    const [result] = await pool.query(
      'INSERT INTO achievements_library (name, type, description, criteria) VALUES (?, ?, ?, ?)',
      [name, type, description, criteria]
    );
    res.status(201).json({ achievement_id: result.insertId, message: 'Achievement created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateAchievement = async (req, res) => {
  try {
    const { achievementId } = req.params;
    const { name, type, description, criteria } = req.body;
    await pool.query(
      'UPDATE achievements_library SET name = ?, type = ?, description = ?, criteria = ? WHERE id = ?',
      [name, type, description, criteria, achievementId]
    );
    res.json({ message: 'Achievement updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteAchievement = async (req, res) => {
  try {
    const { achievementId } = req.params;
    await pool.query('DELETE FROM achievements_library WHERE id = ?', [achievementId]);
    res.json({ message: 'Achievement deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
