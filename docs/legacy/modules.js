const express = require('express');
const router = express.Router();
const { Module, ModuleRegistration } = require('../models/models');

// Get all modules for a program
router.get('/program/:programId', async (req, res) => {
  const modules = await Module.findAll({ where: { program_id: req.params.programId } });
  res.json(modules);
});

// Create a new module (admin/tutor only)
router.post('/', async (req, res) => {
  // ...authorization middleware...
  const module = await Module.create(req.body);
  res.status(201).json(module);
});

// Register student for a module
router.post('/:moduleId/register', async (req, res) => {
  const { student_id } = req.body;
  const { moduleId } = req.params;
  const reg = await ModuleRegistration.create({ student_id, module_id: moduleId });
  res.status(201).json(reg);
});

module.exports = router;