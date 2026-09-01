const { z } = require('zod');
const { catalogIdSchema, MISSION_STAT_KEYS, ACHIEVEMENT_EVENT_TYPES, RULE_OPS } = require('../contracts/platform');

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
    default_voice: z.string().optional(),
    org_id: z.string().trim().min(1).max(64).nullable().optional(),
    visibility: z.enum(['org', 'marketplace', 'unlisted']).optional(),
});

const updateProgramSchema = z.object({
    name: z.string().min(3).optional(),
    description: z.string().optional(),
    image_url: z.string().optional(),
    cover_image: z.string().optional(),
    is_published: z.boolean().optional(),
    default_voice: z.string().optional(),
    org_id: z.string().trim().min(1).max(64).nullable().optional(),
    visibility: z.enum(['org', 'marketplace', 'unlisted']).optional(),
});

// Module Validators
const createModuleSchema = z.object({
    name: z.string().min(3, 'Module name must be at least 3 characters'),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    image_url: z.string().optional(),
    cover_image: z.string().optional(),
    is_published: z.boolean().optional(),
    default_voice: z.string().optional(),
});

const updateModuleSchema = z.object({
    name: z.string().min(3).optional(),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    image_url: z.string().optional(),
    cover_image: z.string().optional(),
    is_published: z.boolean().optional(),
    default_voice: z.string().optional(),
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
    voice: z.string().optional(),
    introAudioUrl: z.string().nullable().optional(),
});

const updateLessonSchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    slides: z.array(slideSchema).optional(),
    settings: z.object({}).passthrough().optional(),
    voice: z.string().optional(),
    introAudioUrl: z.string().nullable().optional(),
    version: z.number().int().min(0).optional(),
    is_published: z.boolean().optional(),
});

const achievementRuleSchema = z.object({
    field: z.string().min(1).max(64),
    op: z.enum(RULE_OPS),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    over: z.string().min(1).max(64).optional(),
});

const missionFiltersSchema = z.object({
    mode: z.enum(['live', 'practice']).optional(),
    type: z.string().min(1).max(64).optional(),
    perfect: z.boolean().optional(),
    lessonId: z.string().min(1).max(128).optional(),
    componentId: z.string().min(1).max(128).optional(),
}).nullish();

const optionalCatalogId = z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    catalogIdSchema.optional()
);

const createMissionSchema = z.object({
    id: optionalCatalogId,
    level: z.number().int().min(1).max(99),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    targetCount: z.number().int().min(1).max(10000),
    rewardStars: z.number().int().min(0).max(1000),
    stat: z.enum(MISSION_STAT_KEYS),
    filters: missionFiltersSchema,
    enabled: z.boolean().optional(),
});

const updateMissionSchema = createMissionSchema.omit({ id: true }).partial();

const createAchievementSchema = z.object({
    id: optionalCatalogId,
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    icon: z.string().min(1).max(32).optional().default('award'),
    rewardStars: z.number().int().min(0).max(1000),
    eventType: z.enum(ACHIEVEMENT_EVENT_TYPES),
    enabled: z.boolean().optional(),
    rules: z.array(achievementRuleSchema).min(1).max(12),
});

const updateAchievementSchema = createAchievementSchema.omit({ id: true }).partial();

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
    createMissionSchema,
    updateMissionSchema,
    createAchievementSchema,
    updateAchievementSchema,
};
