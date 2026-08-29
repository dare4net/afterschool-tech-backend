function currentVersion(doc) {
    const n = Number(doc?.version);
    return Number.isFinite(n) ? n : 0;
}

function expectedVersion(value) {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Decide insert / update / conflict for an optimistic version field.
 * Missing documents and missing version both count as 0.
 */
function decideWrite(existing, clientVersion) {
    const expected = expectedVersion(clientVersion);
    if (!existing) {
        if (expected === 0) return { action: 'insert', version: 1 };
        return { action: 'conflict', version: 0 };
    }
    const current = currentVersion(existing);
    if (expected !== current) {
        return { action: 'conflict', version: current };
    }
    return { action: 'update', version: current + 1 };
}

function versionMatchFilter(doc) {
    const current = currentVersion(doc);
    if (current === 0) {
        return { $or: [{ version: { $exists: false } }, { version: 0 }] };
    }
    return { version: current };
}

module.exports = {
    currentVersion,
    expectedVersion,
    decideWrite,
    versionMatchFilter,
};
