const { log } = require('../helpers/logger');

function defaultPing() {
    return require('../config/database').pingDb();
}

function createHealthHandler({ ping = defaultPing } = {}) {
    return async function healthHandler(req, res) {
        const requestId = req.requestId || null;
        try {
            await ping();
            return res.status(200).json({ status: 'ok', db: 'ok', requestId });
        } catch (err) {
            log('error', 'health_db_down', {
                requestId,
                err: err?.message || String(err),
            });
            return res.status(503).json({ status: 'unhealthy', db: 'down', requestId });
        }
    };
}

module.exports = {
    createHealthHandler,
    healthHandler: createHealthHandler(),
};
