const { resolveInteractionUserId } = require('../helpers/actorUser');
const { mergeComponentsState } = require('../helpers/interactionMerge');
const { currentVersion } = require('../helpers/optimisticVersion');
const interactionsRepo = require('../repositories/interactionsRepo');
const { notifyIfProgressUnlockedNext } = require('../helpers/lessonUnlock');

function emptyLessonState() {
    return {
        slides: [],
        currentSlideIndex: 0,
        lessonTitle: '',
        lessonDescription: '',
    };
}

exports.getInteraction = async (req, res) => {
    try {
        const resolved = resolveInteractionUserId(req);
        if (resolved.error) {
            return res.status(resolved.status).json({ error: resolved.error });
        }
        const lessonId = req.validatedQuery.lessonId;

        const interaction = await interactionsRepo.findByUserAndLesson(resolved.userId, lessonId);
        if (!interaction) {
            return res.status(404).json({ error: 'Not found' });
        }
        if (!interaction.lessonState) {
            interaction.lessonState = emptyLessonState();
        }
        interaction.version = currentVersion(interaction);
        res.json(interaction);
    } catch (err) {
        console.error('[INTERACTIONS] GET error:', err);
        res.status(500).json({ error: 'Failed to load interaction' });
    }
};

exports.saveInteraction = async (req, res) => {
    try {
        const resolved = resolveInteractionUserId(req);
        if (resolved.error) {
            return res.status(resolved.status).json({ error: resolved.error });
        }
        const { lessonId, componentsState, lessonState, attemptsMap, version } = req.validatedBody;

        const existing = await interactionsRepo.findByUserAndLesson(resolved.userId, lessonId);
        const previousProgress = Number(existing?.lessonState?.progress) || 0;
        const mergedComponentsState = mergeComponentsState(
            componentsState || {},
            existing?.componentsState || {}
        );

        const result = await interactionsRepo.upsertProgress(resolved.userId, lessonId, {
            componentsState: mergedComponentsState,
            lessonState,
            attemptsMap,
            version,
        });
        if (result.conflict) {
            return res.status(409).json({
                error: 'Version conflict',
                version: result.version,
            });
        }
        await interactionsRepo.touchProgramActivity(resolved.userId);
        const nextProgress = Number(lessonState?.progress) || 0;
        notifyIfProgressUnlockedNext(resolved.userId, lessonId, previousProgress, nextProgress).catch((err) => {
            console.error('[INTERACTIONS] unlock notify failed:', err);
        });

        res.json({ success: true, id: result.upsertedId, version: result.version });
    } catch (err) {
        console.error('[INTERACTIONS] POST error:', err);
        res.status(500).json({ error: 'Failed to save interaction' });
    }
};
