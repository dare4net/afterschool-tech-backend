const { credentialsMatch, signSuperadminToken, getCredentials } = require('../helpers/superadminAuth');
const { listJobs, runJob } = require('../helpers/jobs');

exports.login = async (req, res) => {
    try {
        const username = typeof req.body?.username === 'string' ? req.body.username : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const result = credentialsMatch(username, password);
        if (!result.configured) {
            return res.status(503).json({ error: 'Superadmin is not configured' });
        }
        if (!result.ok) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = signSuperadminToken();
        return res.json({ success: true, token, username: getCredentials().username });
    } catch (err) {
        console.error('[SUPERADMIN] Login failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.me = async (req, res) => {
    res.json({
        success: true,
        username: req.superadmin.username,
        role: 'superadmin',
    });
};

exports.listJobs = async (req, res) => {
    try {
        const jobs = await listJobs();
        return res.json({ success: true, jobs });
    } catch (err) {
        console.error('[SUPERADMIN] List jobs failed:', err);
        return res.status(500).json({ error: 'Failed to list jobs' });
    }
};

exports.runJob = async (req, res) => {
    try {
        const dryRun = req.body?.dryRun !== false;
        const result = await runJob(req.params.id, {
            dryRun,
            actor: req.superadmin && req.superadmin.username,
        });
        if (!result) {
            return res.status(404).json({ error: 'Unknown job' });
        }
        if (result.error === 'busy') {
            return res.status(409).json({ error: 'Job is already running' });
        }
        return res.json({ success: true, result });
    } catch (err) {
        console.error('[SUPERADMIN] Run job failed:', err);
        return res.status(500).json({ error: 'Failed to run job' });
    }
};
