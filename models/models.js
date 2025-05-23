const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// User
const User = sequelize.define('User', {
  user_id: { type: DataTypes.INTEGER, primaryKey: true },
  email: DataTypes.STRING,
  full_name: DataTypes.STRING,
  password_hash: DataTypes.STRING,
  account_type: DataTypes.ENUM('student', 'parent', 'organization', 'tutor'),
  created_at: DataTypes.DATE
}, { tableName: 'users', timestamps: false });

// Student
const Student = sequelize.define('Student', {
  user_id: { type: DataTypes.INTEGER, primaryKey: true },
  email: DataTypes.STRING,
  full_name: DataTypes.STRING,
  birth_date: DataTypes.DATE,
  level: DataTypes.INTEGER,
  organization_id: DataTypes.INTEGER
}, { tableName: 'students', timestamps: false });

// Program
const Program = sequelize.define('Program', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  name: DataTypes.STRING,
  description: DataTypes.TEXT,
  start_date: DataTypes.DATE,
  end_date: DataTypes.DATE,
  created_at: DataTypes.DATE
}, { tableName: 'programs', timestamps: false });

// Module
const Module = sequelize.define('Module', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  program_id: DataTypes.INTEGER,
  name: DataTypes.STRING,
  description: DataTypes.TEXT
}, { tableName: 'modules', timestamps: false });

// CurriculumItem
const CurriculumItem = sequelize.define('CurriculumItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  module_id: DataTypes.INTEGER,
  title: DataTypes.STRING,
  item_type: DataTypes.ENUM('lesson', 'evaluation', 'project'),
  position: DataTypes.INTEGER,
  delivery_mode: DataTypes.ENUM('solo', 'group')
}, { tableName: 'curriculum_items', timestamps: false });

// Achievement
const Achievement = sequelize.define('Achievement', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  name: DataTypes.STRING,
  type: DataTypes.ENUM('badge', 'certificate', 'achievement'),
  description: DataTypes.TEXT,
  criteria: DataTypes.TEXT
}, { tableName: 'achievements_library', timestamps: false });

// StudentAchievement
const StudentAchievement = sequelize.define('StudentAchievement', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  student_id: DataTypes.INTEGER,
  achievement_id: DataTypes.INTEGER,
  earned_at: DataTypes.DATE
}, { tableName: 'student_achievements', timestamps: false });

// ProgramRegistration
const ProgramRegistration = sequelize.define('ProgramRegistration', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  student_id: DataTypes.INTEGER,
  program_id: DataTypes.INTEGER,
  registration_date: DataTypes.DATE
}, { tableName: 'program_registrations', timestamps: false });

// ModuleRegistration
const ModuleRegistration = sequelize.define('ModuleRegistration', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  student_id: DataTypes.INTEGER,
  module_id: DataTypes.INTEGER,
  registration_date: DataTypes.DATE
}, { tableName: 'module_registrations', timestamps: false });

// CurriculumAchievement
const CurriculumAchievement = sequelize.define('CurriculumAchievement', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  curriculum_item_id: DataTypes.INTEGER,
  achievement_id: DataTypes.INTEGER
}, { tableName: 'curriculum_achievements', timestamps: false });

// ModuleAchievement
const ModuleAchievement = sequelize.define('ModuleAchievement', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  module_id: DataTypes.INTEGER,
  achievement_id: DataTypes.INTEGER
}, { tableName: 'module_achievements', timestamps: false });

// Associations
Program.hasMany(Module, { foreignKey: 'program_id' });
Module.belongsTo(Program, { foreignKey: 'program_id' });

Module.hasMany(CurriculumItem, { foreignKey: 'module_id' });
CurriculumItem.belongsTo(Module, { foreignKey: 'module_id' });

CurriculumItem.belongsToMany(Achievement, {
  through: CurriculumAchievement,
  foreignKey: 'curriculum_item_id',
  otherKey: 'achievement_id'
});
Achievement.belongsToMany(CurriculumItem, {
  through: CurriculumAchievement,
  foreignKey: 'achievement_id',
  otherKey: 'curriculum_item_id'
});

Module.belongsToMany(Achievement, {
  through: ModuleAchievement,
  foreignKey: 'module_id',
  otherKey: 'achievement_id'
});
Achievement.belongsToMany(Module, {
  through: ModuleAchievement,
  foreignKey: 'achievement_id',
  otherKey: 'module_id'
});

Program.belongsToMany(Achievement, {
  through: 'program_achievements',
  foreignKey: 'program_id',
  otherKey: 'achievement_id'
});
Achievement.belongsToMany(Program, {
  through: 'program_achievements',
  foreignKey: 'achievement_id',
  otherKey: 'program_id'
});

module.exports = {
  User,
  Student,
  Program,
  Module,
  CurriculumItem,
  Achievement,
  StudentAchievement,
  ProgramRegistration,
  ModuleRegistration,
  CurriculumAchievement,
  ModuleAchievement
};