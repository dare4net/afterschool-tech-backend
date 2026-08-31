const HUNT_TYPES = new Set([
    'quiz', 'trueFalse', 'annotateImage', 'categorise', 'timeline', 'dragDrop', 'matchingPairs',
    'fillInTheBlank', 'hotspot', 'flashcardQuiz', 'multiSelectQuiz', 'codeEditor', 'shortAnswer',
    'scaleSlider', 'wordCloud', 'poll', 'flashcards', 'wordScramble', 'memoryGrid', 'spinTheWheel',
    'annotationBoard', 'anagram', 'hangman', 'swipeDeck', 'spectrumSorter', 'jigsaw', 'crossword',
    'clickableImage', 'miniGame',
]);

function humanizeType(type) {
    const text = String(type || '').replace(/([A-Z])/g, ' $1').trim();
    if (!text) return 'Block';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function componentMaxPoints(comp) {
    const props = (comp && comp.props) || {};
    const points = Number(props.points) || 0;
    if (points <= 0) return 0;
    switch (comp.type) {
        case 'fillInTheBlank': {
            const fromBlanks = Array.isArray(props.blanks) ? props.blanks.length : 0;
            const fromText = (String(props.text || '').match(/\[blank\]/g) || []).length;
            return points * (fromBlanks || fromText || 1);
        }
        case 'dragDrop':
            return points * (Array.isArray(props.items) ? props.items.length : 1);
        case 'matchingPairs':
            return points * (Array.isArray(props.pairs) ? props.pairs.length : 1);
        case 'quiz':
            return points * (Array.isArray(props.questions) ? props.questions.length : 1);
        default:
            return points;
    }
}

function componentScoringUnits(comp) {
    const props = (comp && comp.props) || {};
    switch (comp.type) {
        case 'fillInTheBlank': {
            const fromBlanks = Array.isArray(props.blanks) ? props.blanks.length : 0;
            const fromText = (String(props.text || '').match(/\[blank\]/g) || []).length;
            return Math.max(1, fromBlanks || fromText || 1);
        }
        case 'quiz':
        case 'flashcardQuiz':
        case 'multiSelectQuiz':
            return Math.max(1, Array.isArray(props.questions) ? props.questions.length : 1);
        case 'matchingPairs':
            return Math.max(1, Array.isArray(props.pairs) ? props.pairs.length : 1);
        case 'dragDrop':
            return Math.max(1, Array.isArray(props.items) ? props.items.length : 1);
        case 'categorise':
        case 'spectrumSorter':
            return Math.max(1, Array.isArray(props.items) ? props.items.length : 1);
        case 'hotspot':
            return Math.max(1, Array.isArray(props.hotspots) ? props.hotspots.length : 1);
        case 'swipeDeck':
            return Math.max(1, Array.isArray(props.cards) ? props.cards.length : 1);
        default:
            return 1;
    }
}

const STARS_PER_UNIT = 5;

function summarizeLessonHunt(slides) {
    const activities = [];
    let totalPoints = 0;
    let livePoints = 0;
    let practicePoints = 0;
    let maxStars = 0;

    for (const slide of slides || []) {
        for (const comp of slide.components || []) {
            if (!comp || !comp.type) continue;
            const maxPoints = componentMaxPoints(comp);
            const mode = (comp.props && comp.props.mode) || comp.mode || 'practice';
            if (maxPoints <= 0 && !HUNT_TYPES.has(comp.type)) continue;
            const stars = mode === 'live' && maxPoints > 0 ? STARS_PER_UNIT * componentScoringUnits(comp) : 0;
            totalPoints += maxPoints;
            if (mode === 'live') livePoints += maxPoints;
            else practicePoints += maxPoints;
            maxStars += stars;
            activities.push({
                type: comp.type,
                label: humanizeType(comp.type),
                slideTitle: slide.title || '',
                mode,
                points: maxPoints,
                maxStars: stars,
            });
        }
    }

    return { activities, totalPoints, livePoints, practicePoints, maxStars };
}

module.exports = {
    HUNT_TYPES,
    STARS_PER_UNIT,
    humanizeType,
    componentMaxPoints,
    componentScoringUnits,
    summarizeLessonHunt,
};
