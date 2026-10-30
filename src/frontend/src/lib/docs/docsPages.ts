// The one list of docs pages. The hub (DocsView.vue) draws its cards from it, and the shared page layout
// (DocsPageLayout.vue) reads the breadcrumb, the header art, the "Related" cards and the previous/next
// links off the same entries, so a page only has to be added here to join all of them.
//
// The routes guard the showcase manifests (router/index.ts), so the `art` below resolves synchronously.

export type DocsPageId =
  | 'tiles'
  | 'bogLands'
  | 'techTree'
  | 'production'
  | 'shrines'
  | 'walls'
  | 'founding'
  | 'landMovement'
  | 'ships'
  | 'wildlifeCamps'
  | 'wastedLands';

export type DocsGroupId = 'island' | 'building' | 'move' | 'beyond';

/**
 * How a page's art sits in its header: `icon` beside the title (a page about one tile or building family),
 * `backdrop` as a dim picture behind the right of the header. Phones always get `icon`.
 */
export type DocsHeaderArtMode = 'icon' | 'backdrop';

export interface DocsRelated {
  page: DocsPageId;
  /** `docs.related.reasons.<from>.<to>` in docs.json: why a reader of this page may want that one. */
  reasonKey: string;
}

export interface DocsPageEntry {
  id: DocsPageId;
  to: string;
  /**
   * A `showcase` atlas frame, `camp:<family>` for an animated wildlife camp, or
   * `anim:<family>:<level>` for a building with a `buildings-anim` clip playing.
   */
  art: string;
  titleKey: string;
  descriptionKey: string;
  headerArt: DocsHeaderArtMode;
  /** Up to three pages that go well with this one, most useful first. */
  related: DocsRelated[];
}

export interface DocsGroupEntry {
  id: DocsGroupId;
  titleKey: string;
  descriptionKey: string;
  pages: DocsPageEntry[];
}

function page(
  id: DocsPageId,
  to: string,
  art: string,
  headerArt: DocsHeaderArtMode,
  related: DocsPageId[],
): DocsPageEntry {
  return {
    id,
    to,
    art,
    titleKey: `docs.hub.pages.${id}.title`,
    descriptionKey: `docs.hub.pages.${id}.description`,
    headerArt,
    related: related.map((target) => ({ page: target, reasonKey: `docs.related.reasons.${id}.${target}` })),
  };
}

function group(id: DocsGroupId, pages: DocsPageEntry[]): DocsGroupEntry {
  return { id, titleKey: `docs.hub.groups.${id}.title`, descriptionKey: `docs.hub.groups.${id}.description`, pages };
}

// Hub order: the groups, and the pages inside each. Previous/next walk it across groups.
export const DOCS_GROUPS: DocsGroupEntry[] = [
  group('island', [
    page('tiles', '/docs/tiles', 'foresttile_SE_variant001', 'icon', ['bogLands', 'production', 'landMovement']),
    page('bogLands', '/docs/bog-lands', 'bog_SE_variant004', 'icon', ['tiles', 'production', 'wildlifeCamps']),
  ]),
  group('building', [
    page('techTree', '/tech-tree', 'druidhut_SE_level006', 'backdrop', ['production', 'shrines', 'walls']),
    page('production', '/docs/production', 'anim:reindeerherder:4', 'icon', ['techTree', 'shrines', 'bogLands']),
    // The Shrine of Thor's art family is `torshrine` (buildingArt.ts); its last level is 3.
    page('shrines', '/docs/shrines', 'torshrine_SE_level003', 'icon', ['techTree', 'production', 'landMovement']),
    page('walls', '/docs/walls', 'palisade_gate180_SE_level002', 'icon', ['landMovement', 'techTree', 'wastedLands']),
  ]),
  group('move', [
    page('founding', '/docs/founding', 'cartworkshop_SE_level004', 'backdrop', ['landMovement', 'wildlifeCamps', 'bogLands']),
    page('landMovement', '/docs/land-movement', 'riverbridge_SE_level004', 'backdrop', ['walls', 'wildlifeCamps', 'founding']),
    page('ships', '/docs/ships', 'dockyard_SE_level007', 'backdrop', ['shrines', 'walls', 'wildlifeCamps']),
  ]),
  group('beyond', [
    page('wildlifeCamps', '/docs/wildlife-camps', 'camp:boarwallow', 'icon', ['landMovement', 'bogLands', 'wastedLands']),
    page('wastedLands', '/docs/wasted-lands', 'jotunwatchtower_SE_level002', 'backdrop', ['wildlifeCamps', 'walls', 'landMovement']),
  ]),
];

/** Every page in hub order. */
export const DOCS_PAGES: DocsPageEntry[] = DOCS_GROUPS.flatMap((g) => g.pages);

export function docsPageById(id: DocsPageId): DocsPageEntry {
  return DOCS_PAGES.find((p) => p.id === id)!;
}

/** The page a route path belongs to, or undefined (the hub, any other route). */
export function docsPageByPath(path: string): DocsPageEntry | undefined {
  return DOCS_PAGES.find((p) => p.to === path);
}

export function docsGroupOf(id: DocsPageId): DocsGroupEntry {
  return DOCS_GROUPS.find((g) => g.pages.some((p) => p.id === id))!;
}

/** The neighbours in hub order across groups; the first page has no previous, the last no next. */
export function docsNeighbours(id: DocsPageId): { previous?: DocsPageEntry; next?: DocsPageEntry } {
  const i = DOCS_PAGES.findIndex((p) => p.id === id);
  return { previous: DOCS_PAGES[i - 1], next: DOCS_PAGES[i + 1] };
}

/**
 * The still frame behind an `art` string: the frame itself, a camp's cleared showcase frame, or the showcase
 * frame of a building whose clip plays on the hub. Header, menu and footer art show this one.
 */
export function docsStillFrameName(art: string): string {
  if (art.startsWith('camp:')) return `${art.slice(5)}_SE_level000`;
  if (art.startsWith('anim:')) {
    const [, family, level] = art.split(':');
    return `${family}_SE_level${String(level).padStart(3, '0')}`;
  }
  return art;
}
