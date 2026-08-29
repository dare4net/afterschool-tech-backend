const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

describe('D2 admin API is unmounted', () => {
    it('server.js does not mount /api/admin', () => {
        const source = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');
        assert.equal(source.includes("require('./routes/adminRoutes')"), false);
        assert.equal(source.includes("app.use('/api/admin'"), false);
        assert.equal(source.includes('app.use("/api/admin"'), false);
        assert.equal(source.includes("routes/adminRoutes"), false);
    });

    it('deletes the MySQL pool.query admin controller and router', () => {
        assert.equal(existsSync(join(__dirname, '../routes/adminRoutes.js')), false);
        assert.equal(existsSync(join(__dirname, '../controllers/adminController.js')), false);
    });
});
