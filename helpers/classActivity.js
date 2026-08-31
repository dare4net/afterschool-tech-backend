const { notify: defaultNotify } = require('./notify');
const { notifyEnrolled: defaultNotifyEnrolled } = require('./curriculumDrops');
const { resolveLessonRef: defaultResolveLesson } = require('./lessonRef');
const defaultCurriculumRepo = require('../repositories/curriculumRepo');
const defaultDedupe = require('../repositories/notifyDedupeRepo');
const { log } = require('./logger');

const MILESTONES = [1, 5, 10, 25];
const TUTOR_THROTTLE_MS = 10 * 60 * 1000;
const FANOUT_CAP = 200;

function crossedMilestone(previousTotal, nextTotal) {
    const before = Math.max(0, Number(previousTotal) || 0);
    const after = Math.max(0, Number(nextTotal) || 0);
    const hits = MILESTONES.filter((mark) => before < mark && after >= mark);
    return hits.length ? hits[hits.length - 1] : null;
}

function lessonTitle(ref) {
    const catalog = ref && ref.catalog;
    const content = ref && ref.content;
    return (catalog && catalog.title)
        || (content && (content.title || content.lessonTitle))
        || 'a lesson';
}

function activityNoun(kind) {
    if (kind === 'poll') return 'poll';
    if (kind === 'cloud') return 'word cloud';
    return 'scale';
}

function classCopy(kind, title, milestone) {
    const noun = activityNoun(kind);
    if (milestone === 1) {
        return {
            title: `Class ${noun} is live`,
            body: `Someone just contributed to the ${noun} in ${title}.`,
        };
    }
    return {
        title: `Class ${noun} is filling up`,
        body: `The ${noun} in ${title} has ${milestone} responses.`,
    };
}

function createClassActivity({
    notify = defaultNotify,
    notifyEnrolled = defaultNotifyEnrolled,
    resolveLesson = defaultResolveLesson,
    curriculumRepo = defaultCurriculumRepo,
    claimOnce = defaultDedupe.claimOnce,
    claimThrottle = defaultDedupe.claimThrottle,
} = {}) {
    async function contextFor(lessonId) {
        const ref = await resolveLesson(lessonId);
        if (!ref || !ref.catalog || !ref.catalog.module_id) return null;
        const module = await curriculumRepo.findModule(ref.catalog.module_id);
        if (!module || !module.program_id) return null;
        const program = await curriculumRepo.findProgram(module.program_id);
        if (!program) return null;
        return { ref, module, program };
    }

    async function pingTutor({ program, ref, kind, actorId, lessonId, componentId }) {
        const tutorId = program.tutor_id ? String(program.tutor_id) : null;
        if (!tutorId || (actorId && tutorId === String(actorId))) return;
        const allowed = await claimThrottle(
            `class-activity:${program._id}:${lessonId}:${componentId}`,
            TUTOR_THROTTLE_MS
        );
        if (!allowed) return;
        const title = lessonTitle(ref);
        const noun = activityNoun(kind);
        const publicId = ref.publicId || lessonId;
        await notify({
            userId: tutorId,
            actorId: actorId || null,
            type: 'CLASS_ACTIVITY',
            title: `Students are answering the ${noun}`,
            body: `Activity in ${title}. Open the lesson to see it.`,
            href: `/tutor-view/${encodeURIComponent(String(publicId))}`,
            payload: { lessonId: String(lessonId), componentId: String(componentId), kind },
        });
    }

    async function onContribution({
        kind,
        type,
        lessonId,
        componentId,
        actorId,
        previousTotal,
        nextTotal,
    }) {
        const milestone = crossedMilestone(previousTotal, nextTotal);
        if (!milestone) return { notified: 0, milestone: null };
        try {
            const ctx = await contextFor(lessonId);
            if (!ctx) return { notified: 0, milestone };
            const claimed = await claimOnce(`collab:${lessonId}:${componentId}:${type}:${milestone}`);
            if (!claimed) return { notified: 0, milestone };
            const title = lessonTitle(ctx.ref);
            const copy = classCopy(kind, title, milestone);
            const href = `/dashboard/student/programs/${encodeURIComponent(String(ctx.program._id))}/modules/${encodeURIComponent(String(ctx.module._id))}`;
            const result = await notifyEnrolled({
                programId: ctx.program._id,
                actorId: actorId || null,
                type,
                title: copy.title,
                body: copy.body,
                href,
                payload: {
                    lessonId: String(lessonId),
                    componentId: String(componentId),
                    milestone,
                    kind,
                },
            });
            await pingTutor({
                program: ctx.program,
                ref: ctx.ref,
                kind,
                actorId,
                lessonId,
                componentId,
            });
            return { notified: (result && result.notified) || 0, milestone };
        } catch (err) {
            log('warn', 'class_activity_failed', { msg: err.message, kind, lessonId });
            return { notified: 0, milestone };
        }
    }

    function onPollVote(input) {
        return onContribution({
            kind: 'poll',
            type: 'CLASS_POLL_LIVE',
            lessonId: input.lessonId,
            componentId: input.componentId,
            actorId: input.actorId,
            previousTotal: input.previousTotal,
            nextTotal: input.nextTotal,
        });
    }

    function onCloudWord(input) {
        return onContribution({
            kind: 'cloud',
            type: 'CLASS_CLOUD_LIVE',
            lessonId: input.lessonId,
            componentId: input.componentId,
            actorId: input.actorId,
            previousTotal: input.previousTotal,
            nextTotal: input.nextTotal,
        });
    }

    function onScaleRating(input) {
        return onContribution({
            kind: 'scale',
            type: 'CLASS_SCALE_LIVE',
            lessonId: input.lessonId,
            componentId: input.componentId,
            actorId: input.actorId,
            previousTotal: input.previousTotal,
            nextTotal: input.nextTotal,
        });
    }

    return {
        crossedMilestone,
        onPollVote,
        onCloudWord,
        onScaleRating,
        onContribution,
    };
}

const defaults = createClassActivity();

module.exports = {
    MILESTONES,
    TUTOR_THROTTLE_MS,
    FANOUT_CAP,
    crossedMilestone,
    createClassActivity,
    onPollVote: defaults.onPollVote,
    onCloudWord: defaults.onCloudWord,
    onScaleRating: defaults.onScaleRating,
};
