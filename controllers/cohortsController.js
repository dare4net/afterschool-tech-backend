const cohorts = require('../helpers/cohorts');
const { requireOrgStaff } = require('../helpers/orgAccess');

function mapCohortError(err, res) {
    const code = err && err.code;
    if (code === 'invalid_cohort' || code === 'invalid_status' || code === 'invalid_member' || code === 'invalid_cohort_member') {
        return res.status(400).json({ error: err.message, code });
    }
    if (code === 'join_code_taken') {
        return res.status(409).json({ error: err.message, code });
    }
    if (code === 'org_not_found' || code === 'join_code_not_found' || code === 'org_unavailable') {
        return res.status(404).json({ error: err.message, code });
    }
    if (code === 'seat_cap' || code === 'org_suspended') {
        return res.status(409).json({ error: err.message, code });
    }
    if (code === 'already_in_cohort') {
        return res.status(409).json({ error: err.message, code });
    }
    if (code === 'org_forbidden') {
        return res.status(403).json({ error: err.message, code });
    }
    console.error('[COHORTS]', err);
    return res.status(500).json({ error: 'Cohort request failed' });
}

exports.createCohort = async (req, res) => {
    try {
        const body = req.validatedBody || req.body || {};
        const orgId = req.params.id || body.orgId;
        if (req.user && req.user.user_id && !req.superadmin) {
            await requireOrgStaff(orgId, req.user.user_id);
        }
        const cohort = await cohorts.createCohort({
            orgId,
            name: body.name,
            joinCode: body.joinCode,
            programIds: body.programIds,
            createdBy: (req.user && req.user.user_id) || (req.superadmin && req.superadmin.username) || null,
        });
        return res.status(201).json({ success: true, cohort });
    } catch (err) {
        return mapCohortError(err, res);
    }
};

exports.listCohorts = async (req, res) => {
    try {
        if (req.user && req.user.user_id && !req.superadmin) {
            await requireOrgStaff(req.params.id, req.user.user_id);
        }
        const items = await cohorts.listCohorts(req.params.id);
        return res.json({ success: true, cohorts: items });
    } catch (err) {
        return mapCohortError(err, res);
    }
};

exports.updateCohort = async (req, res) => {
    try {
        const body = req.validatedBody || req.body || {};
        if (req.user && req.user.user_id && !req.superadmin) {
            await requireOrgStaff(req.params.id, req.user.user_id);
        }
        const cohort = await cohorts.updateCohort(req.params.cohortId, body);
        if (!cohort) return res.status(404).json({ error: 'Cohort not found' });
        if (String(cohort.orgId) !== String(req.params.id)) {
            return res.status(404).json({ error: 'Cohort not found' });
        }
        return res.json({ success: true, cohort });
    } catch (err) {
        return mapCohortError(err, res);
    }
};

exports.previewJoin = async (req, res) => {
    try {
        const code = (req.validatedQuery && req.validatedQuery.code) || req.query.code;
        const result = await cohorts.previewJoinCode(code);
        return res.json({ success: true, ...result });
    } catch (err) {
        return mapCohortError(err, res);
    }
};

exports.joinCohort = async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const body = req.validatedBody || req.body || {};
        const result = await cohorts.joinByCode({ code: body.code, userId });
        return res.json({ success: true, ...result });
    } catch (err) {
        return mapCohortError(err, res);
    }
};

exports.assignMemberToCohort = async (req, res) => {
    try {
        const userId = req.user && req.user.user_id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        await requireOrgStaff(req.params.id, userId);
        const body = req.validatedBody || req.body || {};
        const result = await cohorts.assignStudentToCohort({
            orgId: req.params.id,
            cohortId: body.cohortId,
            userId: req.params.userId,
        });
        return res.json({ success: true, ...result });
    } catch (err) {
        return mapCohortError(err, res);
    }
};
