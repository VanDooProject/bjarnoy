// This bundle's own build id, kept apart from appUpdate.ts so the light boot entry (boot.ts) can set it
// without pulling the update machinery in.
let ownBuildId = null;
/** The entry chunk's file name (`assets/index-<hash>.js`), taken from the entry module's own URL. */
export function buildIdFromEntryUrl(entryUrl) {
    return new URL(entryUrl).pathname.replace(/^\//, '');
}
export function setOwnBuildId(id) {
    ownBuildId = id;
}
export function getOwnBuildId() {
    return ownBuildId;
}
