const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { normalizeCloudWord, denormalizeCounts } = require('../repositories/liveAggregatesRepo');

describe('E4 live aggregates', () => {
    it('normalizes word-cloud tokens and restores spaces for display', () => {
        assert.equal(normalizeCloudWord('  Hello!  '), 'hello');
        assert.equal(normalizeCloudWord('climate-change'), 'climate-change');
        assert.equal(normalizeCloudWord('$inc'), 'inc');
        assert.equal(normalizeCloudWord('   '), null);
        assert.deepEqual(denormalizeCounts({ hello_world: 3 }), { 'hello world': 3 });
    });

    it('mounts authorized poll and word-cloud routes', () => {
        const server = readFileSync(join(__dirname, '../server.js'), 'utf8');
        assert.match(server, /app\.use\('\/api\/polls',\s*pollRoutes\)/);
        assert.match(server, /app\.use\('\/api\/wordclouds',\s*wordCloudRoutes\)/);
        assert.match(server, /app\.use\('\/api\/scales',\s*scaleRoutes\)/);
        const polls = readFileSync(join(__dirname, '../routes/pollRoutes.js'), 'utf8');
        const clouds = readFileSync(join(__dirname, '../routes/wordCloudRoutes.js'), 'utf8');
        assert.match(polls, /router\.use\(authorize\)/);
        assert.match(clouds, /router\.use\(authorize\)/);
        assert.match(polls, /validateBody\(pollVoteBodySchema\)/);
        assert.match(clouds, /validateBody\(wordCloudAddBodySchema\)/);
    });

    it('does not $setOnInsert query fields on poll and word-cloud upserts', () => {
        const repo = readFileSync(join(__dirname, '../repositories/liveAggregatesRepo.js'), 'utf8');
        assert.match(repo, /\$setOnInsert:\s*\{\s*createdAt/);
        assert.equal(repo.includes('$setOnInsert: { lessonId, componentId'), false);
    });

    it('controllers go through the live aggregates repository', () => {
        const source = readFileSync(join(__dirname, '../controllers/liveAggregatesController.js'), 'utf8');
        assert.equal(source.includes('db.collection'), false);
        assert.match(source, /liveAggregatesRepo/);
        assert.match(source, /onPollVote/);
        assert.match(source, /onCloudWord/);
        assert.match(source, /onScaleRating/);
        assert.equal(existsSync(join(__dirname, '../repositories/liveAggregatesRepo.js')), true);
    });
});
