function getPath(obj, field) {
    if (!obj || typeof field !== 'string') return undefined;
    return obj[field];
}

function matchRule(payload, rule) {
    if (!rule || typeof rule !== 'object') return false;
    const left = getPath(payload, rule.field);
    switch (rule.op) {
        case 'eq':
            return left === rule.value;
        case 'neq':
            return left !== rule.value;
        case 'gt':
            return Number(left) > Number(rule.value);
        case 'gte':
            return Number(left) >= Number(rule.value);
        case 'lt':
            return Number(left) < Number(rule.value);
        case 'lte':
            return Number(left) <= Number(rule.value);
        case 'exists':
            return left !== undefined && left !== null && left !== '';
        case 'ratioLt': {
            const denom = Number(getPath(payload, rule.over));
            if (!Number.isFinite(denom) || denom === 0) return false;
            return Number(left) / denom < Number(rule.value);
        }
        default:
            return false;
    }
}

function matchesRules(payload, rules) {
    if (!Array.isArray(rules) || rules.length === 0) return false;
    return rules.every((rule) => {
        try {
            return matchRule(payload, rule);
        } catch {
            return false;
        }
    });
}

module.exports = {
    matchRule,
    matchesRules,
};
