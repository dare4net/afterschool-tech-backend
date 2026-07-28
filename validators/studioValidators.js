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
    image_url: z.string().optional(),
    cover_image: z.string().optional(),
    is_published: z.boolean().optional(),
});

const updateProgramSchema = z.object({
    name: z.string().min(3).optional(),
    description: z.string().optional(),
    image_url: z.string().optional(),
    cover_image: z.string().optional(),
    is_published: z.boolean().optional(),
});

// Module Validators
const createModuleSchema = z.object({
    name: z.string().min(3, 'Module name must be at least 3 characters'),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    image_url: z.string().optional(),
    cover_image: z.string().optional(),
    is_published: z.boolean().optional(),
});

const updateModuleSchema = z.object({
    name: z.string().min(3).optional(),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    image_url: z.string().optional(),
    cover_image: z.string().optional(),
    is_published: z.boolean().optional(),
});

// Lesson Validators
const slideSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    status: z.string().optional(),
    state: z.string().optional(),
    components: z.array(z.any()).optional(),
}).passthrough();

const createLessonSchema = z.object({
    title: z.string().min(3, 'Lesson title must be at least 3 characters'),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    slides: z.array(slideSchema),
    settings: z.object({}).passthrough().optional(),
});

const updateLessonSchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    slides: z.array(slideSchema).optional(),
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
