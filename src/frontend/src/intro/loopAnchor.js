const LOOP_FORM = /^#loop(\(.*)?$/;
const SELECTION = /^\((.*)\)$/;
const NUMBER = /^\d+$/;
function decode(hash) {
    try {
        return decodeURIComponent(hash);
    }
    catch {
        return hash;
    }
}
/** Beats selected by a list such as `1-2,5` (1-based, story order), or null when any part is invalid. */
function parseSelection(list, beats) {
    const picked = new Set();
    for (const raw of list.split(',')) {
        const part = raw.replace(/\s+/g, '');
        const [from, to, ...rest] = part.split('-');
        if (rest.length > 0 || !NUMBER.test(from) || (to !== undefined && !NUMBER.test(to)))
            return null;
        const a = Number(from);
        const b = to === undefined ? a : Number(to);
        if (a < 1 || b > beats.length || a > b)
            return null;
        for (let n = a; n <= b; n++)
            picked.add(n);
    }
    return beats.filter((_, i) => picked.has(i + 1)).map((b) => b.id);
}
/**
 * `#loop` plays the intro without end; `#loop(1-2,5)` loops only the listed beats (numbered as in the story
 * list). Returns the beat ids to loop in story order, or null when the hash is not a loop anchor. An invalid
 * selection loops every beat.
 */
export function parseLoopAnchor(hash, beats) {
    const match = LOOP_FORM.exec(decode(hash));
    if (!match)
        return null;
    const all = beats.map((b) => b.id);
    if (match[1] === undefined)
        return all;
    const list = SELECTION.exec(match[1]);
    // unclosed parens or junk after them are invalid like any other bad selection
    return (list && parseSelection(list[1], beats)) ?? all;
}
