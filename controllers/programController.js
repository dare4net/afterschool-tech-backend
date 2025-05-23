const pool = require('../config/db'); // Adjust as needed

exports.createProgram = async (req, res) => {
  try {
    const { name, description, start_date, end_date } = req.body;
    const [result] = await pool.query(
      `INSERT INTO programs (name, description, start_date, end_date) VALUES (?, ?, ?, ?)`,
      [name, description, start_date, end_date]
    );
    res.status(201).json({ program_id: result.insertId, message: 'Program created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProgramDetails = async (req, res) => {
  try {
    const { programId } = req.params;

    const [program] = await pool.query('SELECT * FROM programs WHERE id = ?', [programId]);
    const [modules] = await pool.query('SELECT * FROM modules WHERE program_id = ?', [programId]);
    const [achievements] = await pool.query(
      `SELECT a.* FROM program_achievements pa JOIN achievements a ON pa.achievement_id = a.id WHERE pa.program_id = ?`,
      [programId]
    );

    res.json({ program: program[0], modules, achievements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createModule = async (req, res) => {
  try {
    const { programId } = req.params;
    const { name, description, start_date, end_date } = req.body;
    const [result] = await pool.query(
      `INSERT INTO modules (program_id, name, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
      [programId, name, description, start_date, end_date]
    );
    res.status(201).json({ module_id: result.insertId, message: 'Module created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addCurriculum = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { title, type, order, file_url } = req.body;
    const [result] = await pool.query(
      `INSERT INTO curriculums (module_id, title, type, \`order\`, file_url) VALUES (?, ?, ?, ?, ?)`,
      [moduleId, title, type, order, file_url]
    );
    res.status(201).json({ curriculum_id: result.insertId, message: 'Curriculum added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPredefinedAchievements = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM achievements');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.assignAchievementsToProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const { achievementIds } = req.body;

    const values = achievementIds.map(id => [programId, id]);
    await pool.query('INSERT INTO program_achievements (program_id, achievement_id) VALUES ?', [values]);
    res.json({ message: 'Achievements assigned to program' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.assignAchievementsToModule = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { achievementIds } = req.body;

    const values = achievementIds.map(id => [moduleId, id]);
    await pool.query('INSERT INTO module_achievements (module_id, achievement_id) VALUES ?', [values]);
    res.json({ message: 'Achievements assigned to module' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
