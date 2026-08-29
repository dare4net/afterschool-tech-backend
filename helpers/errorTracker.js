const { log: defaultLog, sanitize } = require('./logger');

function parseSentryDsn(dsn) {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '').split('/')[0];
    if (!url.username || !projectId) {
        throw new Error('invalid Sentry DSN');
    }
    return {
        url: `${url.protocol}//${url.host}/api/${projectId}/store/`,
        key: url.username,
    };
}

async function reportToSentry(error, context) {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return;
    const parsed = parseSentryDsn(dsn);
    await fetch(parsed.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=ast-backend/1.0`,
        },
        body: JSON.stringify({
            message: error?.message || String(error),
            level: 'error',
            event_id: context.requestId,
            extra: context,
            timestamp: Date.now() / 1000,
        }),
    });
}

function createErrorTracker({ log, report } = {}) {
    const logFn = log || defaultLog;
    const reporter = report === undefined ? reportToSentry : report;

    function captureException(error, context = {}) {
        const safe = sanitize(context);
        logFn('error', 'exception', {
            err: error?.message || String(error),
            ...safe,
        });
        if (!reporter) return;
        Promise.resolve(reporter(error, safe)).catch(() => {});
    }

    return { captureException };
}

const { captureException } = createErrorTracker();

module.exports = {
    captureException,
    createErrorTracker,
    parseSentryDsn,
    reportToSentry,
};
