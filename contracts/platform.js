const { z } = require('zod');

const MISSION_IDS = [
    'l1-enroll-program',
    'l1-earn-stars',
    'l1-reset-component',
    'l2-spend-stars',
    'l2-streak-3',
    'l2-review-lesson',
];

const MISSION_STAT_KEYS = [
    'programsEnrolled',
    'starsEarned',
    'lifetimeStarsEarned',
    'componentsReset',
    'starsSpent',
    'consecutiveCorrect',
    'lessonsReviewed',
    'lessonsCompleted',
    'submits',
];

const SCORED_COMPONENT_TYPES = [
    'quiz',
    'trueFalse',
    'multiSelectQuiz',
    'flashcardQuiz',
    'dragDrop',
    'matchingPairs',
    'fillInTheBlank',
    'memoryGrid',
    'wordScramble',
    'hangman',
    'anagram',
    'crossword',
    'jigsaw',
    'spinTheWheel',
    'shortAnswer',
    'categorise',
    'hotspot',
    'codeEditor',
    'miniGame',
    'annotateImage',
    'timeline',
    'scaleSlider',
    'wordCloud',
    'annotationBoard',
    'swipeDeck',
    'spectrumSorter',
    'clickableImage',
];

const PROGRESS_EVENT_TYPES = [
    'COMPONENT_RESET',
    'LESSON_REVIEWED',
    'COMPONENT_SUBMITTED',
    'LESSON_COMPLETED',
    'PROGRAM_ENROLLED',
    'STARS_AWARDED',
    'STARS_SPENT',
];

const ACHIEVEMENT_EVENT_TYPES = [
    'COMPONENT_SUBMITTED',
    'LIVE_EARLY_FINISH',
    'LIVE_TIMEOUT',
    'LESSON_COMPLETED',
    'COMPONENT_RESET',
    'LESSON_REVIEWED',
    'PROGRAM_ENROLLED',
    'STARS_SPENT',
    'STARS_AWARDED',
];

const ACHIEVEMENT_FIELDS_BY_EVENT = {
    COMPONENT_SUBMITTED: ['type', 'mode', 'score', 'maxScore', 'percentage', 'attemptCount', 'isFirstAttempt', 'completionTimeMs', 'componentId'],
    LIVE_EARLY_FINISH: ['type', 'completionTimeMs', 'timeLimitMs', 'componentId'],
    LIVE_TIMEOUT: ['type', 'componentId'],
    LESSON_COMPLETED: ['lessonId', 'programId', 'score', 'maxScore', 'percentage'],
    COMPONENT_RESET: ['type', 'componentId'],
    LESSON_REVIEWED: ['lessonId'],
    PROGRAM_ENROLLED: ['programId'],
    STARS_SPENT: ['amount', 'itemType'],
    STARS_AWARDED: ['amount', 'reason', 'componentId'],
};

const RULE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'ratioLt'];

const catalogIdSchema = z.string().min(1).max(64).regex(
    /^[a-z][a-z0-9-]*$/,
    'Use a lowercase slug like l3-complete-three-lessons'
);

const queryString = z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().min(1)
);

const optionalQueryString = z.preprocess(
    (value) => {
        if (value === undefined || value === null || value === '') return undefined;
        return Array.isArray(value) ? value[0] : value;
    },
    z.string().min(1).optional()
);

const awardStarsBodySchema = z.object({
    amount: z.number().positive(),
    reason: z.string().min(1).optional(),
    componentId: z.string().min(1).optional(),
});

const spendStarsBodySchema = z.object({
    amount: z.number().positive(),
    itemType: z.string().min(1).optional(),
});

const statsEventBodySchema = z.object({
    eventType: z.enum(PROGRESS_EVENT_TYPES),
    isFirstAttempt: z.boolean().optional(),
    percentage: z.number().min(0).max(100).optional(),
    mode: z.enum(['live', 'practice']).optional(),
    type: z.string().min(1).max(64).optional(),
    amount: z.number().positive().optional(),
    lessonId: z.string().min(1).max(128).optional(),
    programId: z.string().min(1).max(128).optional(),
});

const claimMissionBodySchema = z.object({
    missionId: catalogIdSchema,
});

const interactionGetQuerySchema = z.object({
    lessonId: queryString,
    userId: optionalQueryString,
});

const interactionSaveBodySchema = z.object({
    userId: z.string().min(1).optional(),
    lessonId: z.string().min(1),
    componentsState: z.record(z.any()).optional().default({}),
    lessonState: z.record(z.any()).optional(),
    attemptsMap: z.record(z.object({
        firstAttemptCount: z.number().nullable(),
        bestAttemptCount: z.number().nullable(),
    })).optional(),
    version: z.number().int().min(0).optional(),
});

const liveGetQuerySchema = z.object({
    lessonId: queryString,
    componentId: queryString,
});

const pollVoteBodySchema = z.object({
    lessonId: z.string().min(1),
    componentId: z.string().min(1),
    optionId: z.string().min(1).max(64),
});

const wordCloudAddBodySchema = z.object({
    lessonId: z.string().min(1),
    componentId: z.string().min(1),
    word: z.string().min(1).max(40),
});

function zodDetails(error) {
    const items = error.issues || error.errors || [];
    return items.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
    }));
}

function validateBody(schema) {
    return (req, res, next) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: zodDetails(parsed.error),
            });
        }
        req.validatedBody = parsed.data;
        next();
    };
}

function validateQuery(schema) {
    return (req, res, next) => {
        const parsed = schema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: zodDetails(parsed.error),
            });
        }
        req.validatedQuery = parsed.data;
        next();
    };
}

const CONTRACT_KEYS = {
    awardStars: ['amount', 'reason', 'componentId'],
    spendStars: ['amount', 'itemType'],
    statsEvent: ['eventType', 'isFirstAttempt', 'percentage', 'mode', 'type', 'amount', 'lessonId', 'programId'],
    claimMission: ['missionId'],
    interactionGet: ['lessonId', 'userId'],
    interactionSave: ['userId', 'lessonId', 'componentsState', 'lessonState', 'attemptsMap', 'version'],
    missionIds: MISSION_IDS,
    progressEventTypes: PROGRESS_EVENT_TYPES,
};

module.exports = {
    MISSION_IDS,
    MISSION_STAT_KEYS,
    SCORED_COMPONENT_TYPES,
    PROGRESS_EVENT_TYPES,
    ACHIEVEMENT_EVENT_TYPES,
    ACHIEVEMENT_FIELDS_BY_EVENT,
    RULE_OPS,
    catalogIdSchema,
    CONTRACT_KEYS,
    awardStarsBodySchema,
    spendStarsBodySchema,
    statsEventBodySchema,
    claimMissionBodySchema,
    interactionGetQuerySchema,
    interactionSaveBodySchema,
    liveGetQuerySchema,
    pollVoteBodySchema,
    wordCloudAddBodySchema,
    validateBody,
    validateQuery,
};
