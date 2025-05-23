// Program
Program {
  id: int
  name: string
  modules: Module[]
  achievements: Achievement[] // via program_achievements
}

// Module
Module {
  id: int
  program_id: int
  curriculum_items: CurriculumItem[]
  achievements: Achievement[] // via module-level logic
}

// CurriculumItem
CurriculumItem {
  id: int
  module_id: int
  title: string
  item_type: enum
  content_files: ContentFile[]
  achievements: Achievement[] // via curriculum-level logic
}

// Achievement (Badge/Certificate/Achievement)
Achievement {
  id: int
  name: string
  type: enum
  description: string
  criteria: string // Supported criteria examples:
                   // "highest_score" - Award to student with the highest score for a test/evaluation.
                   // "score >= 80"   - Award to students who score 80% or above.
                   // "first_submission" - Award to the first student to submit for a test/evaluation.
                   // "first_to_start"   - Award to the first student to start any curriculum item.
                   // The backend will check these criteria when students interact with curriculum items.
}

// Student
Student {
  user_id: int
  registered_programs: Program[]
  registered_modules: Module[]
  achievements: Achievement[] // via student_achievements
  badges: Achievement[] // type = badge
}