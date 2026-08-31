const { z } = require('zod');

function emptyToUndefined(value) {
    if (value == null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
}

const backendEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
    JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    MONGODB_URI: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SUPERADMIN_USERNAME: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SUPERADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    CLOUDINARY_CLOUD_NAME: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    CLOUDINARY_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    CLOUDINARY_API_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().url().optional()),
    APPLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

function formatZodError(error) {
    return error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`).join('; ');
}

function validateBackendEnv(raw = process.env, { requireSecrets = raw.NODE_ENV !== 'test' } = {}) {
    const parsed = backendEnvSchema.safeParse(raw);
    if (!parsed.success) {
        throw new Error(`Invalid backend environment: ${formatZodError(parsed.error)}`);
    }

    if (requireSecrets) {
        if (!parsed.data.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured');
        }
        if (!parsed.data.MONGODB_URI) {
            throw new Error('MONGODB_URI is not configured');
        }
    }

    return parsed.data;
}

module.exports = {
    backendEnvSchema,
    validateBackendEnv,
};
