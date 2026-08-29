/**
 * Preserve tutor marks and studio resets when a student save races the tutor.
 */
function mergeComponentsState(incoming = {}, existing = {}) {
    const merged = { ...incoming };
    for (const [compId, existingCompState] of Object.entries(existing)) {
        if (!existingCompState || typeof existingCompState !== 'object') continue;
        if (existingCompState.wasReset === true && incoming[compId]?.isSubmitted !== true) {
            merged[compId] = existingCompState;
        } else if (existingCompState.tutorMarked === true) {
            merged[compId] = {
                ...(incoming[compId] || {}),
                tutorMarked: true,
                score: existingCompState.score,
                isApproved: Boolean(existingCompState.isApproved),
                isPendingMarking: false,
                status: 'completed',
                markedBy: existingCompState.markedBy,
                markedAt: existingCompState.markedAt,
            };
        }
    }
    return merged;
}

module.exports = { mergeComponentsState };
