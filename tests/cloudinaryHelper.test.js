const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { requireCloudinaryConfig, getCloudinaryPublicId, uploadToCloudinary } = require('../helpers/cloudinaryHelper');

const ENV_KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

describe('requireCloudinaryConfig', () => {
    const original = {};

    beforeEach(() => {
        for (const key of ENV_KEYS) {
            original[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (original[key] === undefined) delete process.env[key];
            else process.env[key] = original[key];
        }
    });

    it('throws when env vars are missing', () => {
        assert.throws(() => requireCloudinaryConfig(), /must be set/);
    });

    it('throws when any one var is missing', () => {
        process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
        process.env.CLOUDINARY_API_KEY = 'key';
        assert.throws(() => requireCloudinaryConfig(), /must be set/);
    });

    it('returns config when all three are set', () => {
        process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
        process.env.CLOUDINARY_API_KEY = 'key';
        process.env.CLOUDINARY_API_SECRET = 'secret';
        assert.deepEqual(requireCloudinaryConfig(), {
            cloudName: 'cloud',
            apiKey: 'key',
            apiSecret: 'secret',
        });
    });
});

describe('cloudinaryHelper source', () => {
    it('does not contain hardcoded API key or secret fallbacks', () => {
        const source = readFileSync(join(__dirname, '../helpers/cloudinaryHelper.js'), 'utf8');
        assert.equal(source.includes("|| '"), false);
        assert.equal(source.includes('431677943928628'), false);
        assert.equal(source.includes('S1MeiLS39dDREEfHz4xTGhNTzQU'), false);
    });
});

describe('uploadToCloudinary', () => {
    it('refuses to upload when credentials are missing', async () => {
        const original = {};
        for (const key of ENV_KEYS) {
            original[key] = process.env[key];
            delete process.env[key];
        }
        try {
            await assert.rejects(
                () => uploadToCloudinary('data:image/png;base64,aaa', 'folder', 'id-1'),
                /must be set/
            );
        } finally {
            for (const key of ENV_KEYS) {
                if (original[key] === undefined) delete process.env[key];
                else process.env[key] = original[key];
            }
        }
    });
});

describe('getCloudinaryPublicId', () => {
    it('parses a Cloudinary delivery URL without needing credentials', () => {
        const id = getCloudinaryPublicId(
            'https://res.cloudinary.com/demo/image/upload/v12345/ast_thumbnails/program_123.jpg'
        );
        assert.equal(id, 'ast_thumbnails/program_123');
    });
});
