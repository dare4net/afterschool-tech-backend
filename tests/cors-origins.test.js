const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isAllowedCorsOrigin,
    isVanityLocalhostOrigin,
    isVanityProductionOrigin,
} = require('../helpers/corsOrigins');

describe('cors origins', () => {
    it('allows static dev origins', () => {
        assert.equal(isAllowedCorsOrigin('http://localhost:3000'), true);
        assert.equal(isAllowedCorsOrigin('http://localhost:3001'), true);
    });

    it('allows vanity localhost dev origins', () => {
        assert.equal(isVanityLocalhostOrigin('http://riverside.localhost:3000'), true);
        assert.equal(isVanityLocalhostOrigin('http://riverside.localhost:3001'), true);
        assert.equal(isAllowedCorsOrigin('http://riverside.localhost:3000'), true);
    });

    it('rejects reserved vanity localhost hosts', () => {
        assert.equal(isVanityLocalhostOrigin('http://app.localhost:3000'), false);
        assert.equal(isVanityLocalhostOrigin('http://www.localhost:3000'), false);
    });

    it('rejects plain localhost and wrong ports', () => {
        assert.equal(isVanityLocalhostOrigin('http://localhost:3000'), false);
        assert.equal(isVanityLocalhostOrigin('http://riverside.localhost:4000'), false);
    });

    it('allows vanity production subdomains', () => {
        assert.equal(isVanityProductionOrigin('https://riverside.after-school.tech'), true);
        assert.equal(isAllowedCorsOrigin('https://riverside.after-school.tech'), true);
        assert.equal(isVanityProductionOrigin('https://app.after-school.tech'), false);
    });

    it('allows missing origin (same-site / server tools)', () => {
        assert.equal(isAllowedCorsOrigin(undefined), true);
        assert.equal(isAllowedCorsOrigin(''), true);
    });
});
