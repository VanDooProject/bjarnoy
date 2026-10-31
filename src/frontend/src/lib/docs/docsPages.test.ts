// @vitest-environment jsdom
//
// The shared docs page list: every docs route is in it exactly once, the related lists point at real, other pages,
// and every title, description and reason resolves in both languages.
import { describe, expect, it } from 'vitest';
import { router } from '../../router';
import enDocs from '../../i18n/locales/en/docs.json';
import deDocs from '../../i18n/locales/de/docs.json';
import {
  DOCS_GROUPS,
  DOCS_PAGES,
  docsGroupOf,
  docsNeighbours,
  docsPageById,
  docsPageByPath,
  docsStillFrameName,
} from './docsPages';

function lookup(tree: unknown, key: string): unknown {
  return key
    .replace(/^docs\./, '')
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

describe('docsPages', () => {
  it('lists every docs route exactly once, and nothing else', () => {
    const routes = router
      .getRoutes()
      .map((r) => r.path)
      .filter((p) => p.startsWith('/docs/'))
      .sort();
    expect(DOCS_PAGES.map((p) => p.to).sort()).toEqual(routes);
    expect(new Set(DOCS_PAGES.map((p) => p.id)).size).toBe(DOCS_PAGES.length);
    expect(new Set(DOCS_PAGES.map((p) => p.to)).size).toBe(DOCS_PAGES.length);
  });

  it('keeps the hub order: island, building, move, beyond', () => {
    expect(DOCS_GROUPS.map((g) => g.id)).toEqual(['island', 'building', 'move', 'beyond']);
    expect(DOCS_PAGES.map((p) => p.id)).toEqual([
      'tiles', 'bogLands', 'techTree', 'production', 'shrines', 'walls', 'founding', 'landMovement', 'ships', 'wildlifeCamps', 'wastedLands',
    ]);
  });

  it('points every related entry at another listed page, at most three, without repeats', () => {
    for (const page of DOCS_PAGES) {
      expect(page.related.length, page.id).toBeGreaterThan(0);
      expect(page.related.length, page.id).toBeLessThanOrEqual(3);
      const targets = page.related.map((r) => r.page);
      expect(new Set(targets).size, page.id).toBe(targets.length);
      for (const r of page.related) {
        expect(DOCS_PAGES.some((p) => p.id === r.page), `${page.id} -> ${r.page}`).toBe(true);
        expect(r.page, page.id).not.toBe(page.id);
      }
    }
  });

  it('has an English and a German text for every title, description and reason', () => {
    for (const tree of [enDocs, deDocs]) {
      for (const g of DOCS_GROUPS) {
        expect(typeof lookup(tree, g.titleKey), g.titleKey).toBe('string');
        expect(typeof lookup(tree, g.descriptionKey), g.descriptionKey).toBe('string');
      }
      for (const p of DOCS_PAGES) {
        expect(typeof lookup(tree, p.titleKey), p.titleKey).toBe('string');
        expect(typeof lookup(tree, p.descriptionKey), p.descriptionKey).toBe('string');
        for (const r of p.related) expect(typeof lookup(tree, r.reasonKey), r.reasonKey).toBe('string');
      }
    }
  });

  it('has a header art mode per page: icon for single-family pages, backdrop for the rest', () => {
    const modes = Object.fromEntries(DOCS_PAGES.map((p) => [p.id, p.headerArt]));
    expect(modes).toEqual({
      tiles: 'icon', bogLands: 'icon', walls: 'icon', shrines: 'icon', production: 'icon', wildlifeCamps: 'icon',
      techTree: 'backdrop', founding: 'backdrop', landMovement: 'backdrop', ships: 'backdrop', wastedLands: 'backdrop',
    });
  });

  it('finds pages by path and group, and walks previous/next across groups', () => {
    expect(docsPageByPath('/docs/shrines')?.id).toBe('shrines');
    expect(docsPageByPath('/docs')).toBeUndefined();
    expect(docsGroupOf('shrines').id).toBe('building');
    expect(docsNeighbours('shrines')).toMatchObject({ previous: { id: 'production' }, next: { id: 'walls' } });
    expect(docsNeighbours('walls').next?.id).toBe('founding');
    expect(docsNeighbours('tiles').previous).toBeUndefined();
    expect(docsNeighbours('wastedLands').next).toBeUndefined();
    expect(docsPageById('ships').to).toBe('/docs/ships');
  });

  it('resolves animated art to its still showcase frame', () => {
    expect(docsStillFrameName('anim:reindeerherder:4')).toBe('reindeerherder_SE_level004');
    expect(docsStillFrameName('camp:boarwallow')).toBe('boarwallow_SE_level000');
    expect(docsStillFrameName('torshrine_SE_level003')).toBe('torshrine_SE_level003');
  });
});
