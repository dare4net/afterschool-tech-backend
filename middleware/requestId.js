const crypto = require('crypto');
const { log } = require('../helpers/logger');

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

function resolveRequestId(headerValue) {
    if (typeof headerValue === 'string' && REQUEST_ID_RE.test(headerValue)) {
        return headerValue;
    }
    return crypto.randomUUID();
}

function requestIdMiddleware(req, res, next) {
    const id = resolveRequestId(req.headers['x-request-id']);
    req.requestId = id;
    res.setHeader('x-request-id', id);
    next();
}

function requestLogMiddleware(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        log('info', 'http', {
            requestId: req.requestId,
            method: req.method,
            path: req.path || req.url,
            status: res.statusCode,
            ms: Date.now() - start,
        });
    });
    next();
}

module.exports = {
    resolveRequestId,
    requestIdMiddleware,
    requestLogMiddleware,
};
