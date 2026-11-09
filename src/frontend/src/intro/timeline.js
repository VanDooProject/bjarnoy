/**
 * The beats a run plays, in play order. Landing and replay: the intro beats, the hold, the exit. Loop: the selected
 * beats in story order (all of them when none is selected).
 */
export function selectBeats(beats, mode, loopBeats) {
    if (mode === 'loop') {
        const selected = loopBeats ? beats.filter((b) => loopBeats.includes(b.id)) : beats;
        return selected.length > 0 ? selected : beats;
    }
    const hold = beats.find((b) => b.role === 'hold');
    const exit = beats.find((b) => b.role === 'exit');
    return [...beats.filter((b) => b.role === 'intro'), ...(hold ? [hold] : []), ...(exit ? [exit] : [])];
}
/** One chapter per played beat: an intro beat and the exit last their duration, the hold its shortest run. */
export function buildTimeline(played, holdMinMs) {
    let t = 0;
    const chapters = played.map((b) => {
        const durMs = b.role === 'hold' ? holdMinMs : b.durationMs;
        const chapter = { id: b.id, role: b.role, startMs: t, durMs };
        t += durMs;
        return chapter;
    });
    return { chapters, totalMs: t };
}
/** The chapter a position falls in; the end of the timeline belongs to the last chapter. */
export function chapterIndexAt(timeline, ms) {
    const { chapters } = timeline;
    const i = chapters.findIndex((c) => ms < c.startMs + c.durMs);
    return i === -1 ? chapters.length - 1 : i;
}
export function chapterAt(timeline, ms) {
    return timeline.chapters[chapterIndexAt(timeline, ms)];
}
/** `0:12`, `1:05`: whole seconds, rounded down. */
export function fmtTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export const GATING_GROUPS = ['voices', 'terrain', 'buildings'];
export const rowFraction = (row) => (row.total > 0 ? Math.min(1, row.loaded / row.total) : 0);
/** Mean of the gating groups' fractions; a group that has not reported yet counts 0. */
export function gatedLoadFraction(rows) {
    const sum = GATING_GROUPS.reduce((acc, id) => {
        const row = rows.find((r) => r.id === id);
        return acc + (row ? rowFraction(row) : 0);
    }, 0);
    return sum / GATING_GROUPS.length;
}
/** Every group done: the gating ones must have reported; the animations only count once they report. */
export function allLoaded(rows) {
    const gatingDone = GATING_GROUPS.every((id) => {
        const row = rows.find((r) => r.id === id);
        return row !== undefined && row.total > 0 && row.loaded >= row.total;
    });
    return gatingDone && rows.filter((r) => !r.gating).every((r) => r.total > 0 && r.loaded >= r.total);
}
/** How far a seek may go: in the landing, up to the hold's end while the tiles are not loaded. */
export function seekLimitMs(timeline, gated) {
    if (!gated)
        return timeline.totalMs;
    const hold = timeline.chapters.find((c) => c.role === 'hold');
    return hold ? hold.startMs + hold.durMs : timeline.totalMs;
}
