const REDACT_KEY = /auth|token|password|secret|cookie|authorization|dsn/i;
const REDACT_VALUE = /mongodb(\+srv)?:\/\/[^\s]+/gi;

function redactValue(value) {
    if (typeof value !== 'string') return value;
    return value.replace(REDACT_VALUE, 'mongodb://[redacted]');
}

function sanitize(fields) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
    const out = {};
    for (const [key, value] of Object.entries(fields)) {
        if (REDACT_KEY.test(key)) {
            out[key] = '[redacted]';
            continue;
        }
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error)) {
            out[key] = sanitize(value);
            continue;
        }
        out[key] = redactValue(value);
    }
    return out;
}

function createLogger({ write } = {}) {
    const writer =
        write ||
        ((line, level) => {
            const fn = level === 'error' ? console.error : console.log;
            fn(line);
        });

    function log(level, msg, fields = {}) {
        const payload = {
            ...sanitize(fields),
            ts: new Date().toISOString(),
            level,
            msg,
        };
        writer(JSON.stringify(payload), level);
    }

    return { log };
}

const { log } = createLogger();

module.exports = {
    log,
    createLogger,
    sanitize,
};
