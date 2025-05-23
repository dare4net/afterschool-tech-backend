const express = require('express');
const router = express.Router();
const { Program, ProgramRegistration } = require('../models/models');

// Get all programs
router.get('/', async (req, res) => {
  const programs = await Program.findAll();
  res.json(programs);
});

// Create a new program (admin/tutor only)
router.post('/', async (req, res) => {
  // ...authorization middleware...
  const program = await Program.create(req.body);
  res.status(201).json(program);
});

// Register student for a program
router.post('/:programId/register', async (req, res) => {
  const { student_id } = req.body;
  const { programId } = req.params;
  const reg = await ProgramRegistration.create({ student_id, program_id: programId });
  res.status(201).json(reg);
});

module.exports = router;