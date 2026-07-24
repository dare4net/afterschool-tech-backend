const { z } = require('zod');

// Auth Validators
const signupSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['student', 'parent', 'organization', 'tutor']).default('student'),
    full_name: z.string().min(2, 'Full name is required').optional()
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
});

// Program Validators
const createProgramSchema = z.object({
    name: z.string().min(3, 'Program name must be at least 3 characters'),
    description: z.string().optional(),
});

const updateProgramSchema = z.object({
    name: z.string().min(3).optional(),
    description: z.string().optional(),
});

// Module Validators
const createModuleSchema = z.object({
    name: z.string().min(3, 'Module name must be at least 3 characters'),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
});

const updateModuleSchema = z.object({
    name: z.string().min(3).optional(),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
});

// Lesson Validators
const createLessonSchema = z.object({
    title: z.string().min(3, 'Lesson title must be at least 3 characters'),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    slides: z.array(z.object({
        id: z.string(),
        components: z.array(z.any())
    })),
    settings: z.object({}).passthrough().optional(),
});

const updateLessonSchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    slides: z.array(z.object({
        id: z.string(),
        components: z.array(z.any())
    })).optional(),
    settings: z.object({}).passthrough().optional(),
});

// Validation middleware factory
const validate = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.body);
            req.validatedBody = validated;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            next(error);
        }
    };
};

module.exports = {
    validate,
    signupSchema,
    loginSchema,
    createProgramSchema,
    updateProgramSchema,
    createModuleSchema,
    updateModuleSchema,
    createLessonSchema,
    updateLessonSchema,
};
