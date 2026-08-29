const rateLimit = require('express-rate-limit');
const { log } = require('../helpers/logger');
const { captureException } = require('../helpers/errorTracker');

function jsonError(status, error, requestId) {
    const payload = { error };
    if (requestId) payload.requestId = requestId;
    return payload;
}

function notFoundHandler(req, res) {
    res.status(404).json(jsonError(404, 'Not found', req.requestId));
}

/** Express 4-arg handler. Never puts stack traces in the JSON body. */
function errorHandler(err, req, res, next) {
    const status = Number(err.status || err.statusCode) || 500;
    if (res.headersSent) {
        return next(err);
    }
    const requestId = req.requestId;
    if (status >= 500) {
        captureException(err, { requestId, path: req.path || req.url });
    } else {
        log('warn', 'http_error', { requestId, status, err: err.message });
    }
    const payload = {
        error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
    };
    if (requestId) payload.requestId = requestId;
    if (process.env.NODE_ENV !== 'production' && status >= 500 && err.message) {
        payload.detail = err.message;
    }
    res.status(status).json(payload);
}

function authLimiter() {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: jsonError(429, 'Too many requests'),
    });
}

function walletLimiter() {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: jsonError(429, 'Too many requests'),
    });
}

module.exports = {
    notFoundHandler,
    errorHandler,
    authLimiter,
    walletLimiter,
};
