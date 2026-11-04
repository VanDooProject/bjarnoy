// This bundle's own build id, kept apart from appUpdate.ts so the light boot entry (boot.ts) can set it
// without pulling the update machinery in.

let ownBuildId: string | null = null;

/** The entry chunk's file name (`assets/index-<hash>.js`), taken from the entry module's own URL. */
export function buildIdFromEntryUrl(entryUrl: string): string {
  return new URL(entryUrl).pathname.replace(/^\//, '');
}

export function setOwnBuildId(id: string): void {
  ownBuildId = id;
}

export function getOwnBuildId(): string | null {
  return ownBuildId;
}
