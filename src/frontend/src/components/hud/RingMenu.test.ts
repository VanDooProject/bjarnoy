// @vitest-environment jsdom
//
// The 2a ring's navigation rules, which are uniform at every level and are
// what the design settled on after several rounds: hover goes deeper, click
// commits, and the hub (or the ‹ BACK bubble that owns a reserved slot on the
// inner lane) goes up exactly one level. Two of these are regressions the
// design pass reported by hand — a card appearing for a building nobody had
// hovered yet, and Escape throwing away a whole drill-down instead of
// stepping back out of it.
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RingMenu, { type RingCategory } from './RingMenu.vue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

const CATEGORIES: RingCategory[] = [
  {
    id: 'housing',
    label: 'Housing',
    color: 'var(--gold)',
    buildings: [{ id: 'hut', label: 'Hut', cost: { wood: 100, stone: 80 }, time: '4:00', gives: '+5 population capacity' }],
  },
  {
    id: 'defense',
    label: 'Defense',
    color: 'var(--iron)',
    buildings: [
      { id: 'tower', label: 'Watchtower', cost: { wood: 120, stone: 200, iron: 10 }, time: '8:00', lock: 'Requires longhouse 2' },
      { id: 'magictower', label: 'Magic Tower', cost: { wood: 100, stone: 80 }, time: '4:00', gives: '+24 iron/h' },
    ],
  },
];

function ring(overrides: Record<string, unknown> = {}) {
  return mount(RingMenu, {
    props: {
      x: 400,
      y: 300,
      actions: [
        { id: 'details', label: 'Details' },
        { id: 'build', label: 'Build' },
      ],
      categories: CATEGORIES,
      terrainLabel: 'Grassland',
      coordLabel: 'HEX 4, -2',
      bounds: { left: 16, top: 76, right: 1264, bottom: 704 },
      cardBounds: { left: 16, top: 76, right: 1264, bottom: 704 },
      stock: { wood: 150, stone: 150, food: 150, iron: 0 },
      ...overrides,
    },
    global: { plugins: [createTestI18n({ hud: enHud })] },
    attachTo: document.body,
  });
}

function labels(wrapper: ReturnType<typeof ring>): string[] {
  return wrapper.findAll('.ring-bubble').map((b) => b.text());
}

function bubble(wrapper: ReturnType<typeof ring>, label: string) {
  const found = wrapper.findAll('.ring-bubble').find((b) => b.text() === label);
  if (!found) throw new Error(`no bubble labelled "${label}" among ${JSON.stringify(labels(wrapper))}`);
  return found;
}

describe('RingMenu', () => {
  it('opens at the root showing the actions it was given, with the tile on the hub', () => {
    const wrapper = ring();
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
    expect(wrapper.get('.ring-hub').text()).toContain('Grassland');
    expect(wrapper.get('.ring-hub').text()).toContain('HEX 4, -2');
  });

  it('drills into the categories on hover, replacing the root lane rather than orbiting outside it', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    // Two lanes at most: the root actions are gone, the categories plus the
    // reserved back slot are what's on the inner lane now.
    expect(labels(wrapper)).toEqual(['Housing', 'Defense', '‹ BACK']);
    expect(wrapper.get('.ring-hub').text()).toContain('BUILD');
  });

  it('fans a category’s buildings out on hover without committing anything', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');
    expect(labels(wrapper)).toContain('Watchtower');
    expect(labels(wrapper)).toContain('Magic Tower');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('shows no detail card until a building is genuinely hovered', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');
    // Regression: the card used to default to the first building, so opening a
    // category popped a card for something nobody had pointed at.
    expect(wrapper.find('.ring-card').exists()).toBe(false);

    await bubble(wrapper, 'Magic Tower').trigger('mouseenter');
    const card = wrapper.get('.ring-card');
    expect(card.text()).toContain('Magic Tower');
    expect(card.text()).toContain('4:00');
    expect(card.text()).toContain('+24 iron/h');
  });

  it('marks a cost the player cannot afford, and refuses to build a locked building', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');
    await bubble(wrapper, 'Watchtower').trigger('mouseenter');

    // Stock is 150 stone and no iron; the watchtower needs 200 and 10. Wood
    // (120 of 150) is affordable and must not be marked.
    expect(wrapper.get('.ring-card').findAll('b.short').map((b) => b.text())).toEqual(['200', '10']);
    expect(wrapper.get('.ring-card').text()).toContain('REQUIRES LONGHOUSE 2');

    await bubble(wrapper, 'Watchtower').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('commits a building on click', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');
    await bubble(wrapper, 'Magic Tower').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['magictower']]);
  });

  it('treats a touch tap as hover-then-click: first tap previews, second commits', async () => {
    // Touch has no hover, so a bare click would spend resources blind. The
    // first touch tap must do what mouseenter does on desktop — show the
    // card — without building anything. This listens on `touchstart` rather
    // than `pointerdown`: Chromium only suppresses the tap's compatibility
    // `click` when the touch event itself was canceled — verified for real
    // (not just that the handler ran) by e2e/ring-menu.spec.ts's touch test.
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');

    await bubble(wrapper, 'Magic Tower').trigger('touchstart');
    expect(wrapper.get('.ring-card').text()).toContain('Magic Tower');
    expect(wrapper.emitted('select')).toBeUndefined();

    // The building is now previewed; the next tap's click commits it.
    await bubble(wrapper, 'Magic Tower').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['magictower']]);
  });

  it('a touch tap previews a locked building but never commits it', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');

    await bubble(wrapper, 'Watchtower').trigger('touchstart');
    expect(wrapper.get('.ring-card').text()).toContain('REQUIRES LONGHOUSE 2');

    await bubble(wrapper, 'Watchtower').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('does not require a preview tap for a mouse click, which still commits immediately', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');

    // A mouse click never fires touchstart at all, so onBuildingTouchStart
    // never runs — this is the same interaction the pre-touch RingMenu had.
    await bubble(wrapper, 'Magic Tower').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['magictower']]);
  });

  it('emits a root action straight through instead of drilling', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Details').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['details']]);
  });

  it('goes up exactly one level from ‹ BACK and from the hub', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');
    expect(labels(wrapper)).toContain('Watchtower');

    await bubble(wrapper, '‹ BACK').trigger('click');
    expect(labels(wrapper)).toEqual(['Housing', 'Defense', '‹ BACK']);

    await wrapper.get('.ring-hub').trigger('click');
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('steps back out with Escape and only closes from the root', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Defense').trigger('mouseenter');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(labels(wrapper)).toEqual(['Housing', 'Defense', '‹ BACK']);
    expect(wrapper.emitted('close')).toBeUndefined();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
    expect(wrapper.emitted('close')).toBeUndefined();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('never drills on a disabled action', async () => {
    const wrapper = ring({
      actions: [
        { id: 'details', label: 'Details' },
        { id: 'build', label: 'Build', disabled: true, hint: 'Open water' },
      ],
    });
    await bubble(wrapper, 'Build').trigger('mouseenter');
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
  });

  it('exposes a disabled action\'s hint as a hoverable title, not the native disabled attribute', () => {
    // A native `disabled` button doesn't fire mouse events in most browsers,
    // so its `title` tooltip would never actually show on hover — this is
    // what previously left players unable to see e.g. why Upgrade was
    // unavailable. aria-disabled keeps the same "can't interact" semantics
    // while leaving hover, and so the tooltip, working.
    const wrapper = ring({
      actions: [
        { id: 'details', label: 'Details' },
        { id: 'upgrade', label: 'Upgrade', disabled: true, hint: 'Not enough wood, stone' },
      ],
    });
    const upgrade = bubble(wrapper, 'Upgrade');
    expect(upgrade.attributes('title')).toBe('Not enough wood, stone');
    expect(upgrade.attributes('disabled')).toBeUndefined();
    expect(upgrade.attributes('aria-disabled')).toBe('true');
  });

  it('stays one lane deep when it has no categories, for the onboarding ring', async () => {
    const wrapper = ring({
      categories: [],
      actions: [
        { id: 'farm', label: 'Farm' },
        { id: 'lumberjack', label: 'Lumberjack', disabled: true, hint: 'Needs forest' },
      ],
    });
    await bubble(wrapper, 'Farm').trigger('mouseenter');
    expect(labels(wrapper)).toEqual(['Farm', 'Lumberjack']);
    await bubble(wrapper, 'Farm').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['farm']]);
  });

  // Design handoff "2a": the flat onboarding ring's dimmed option gets a
  // persistent, muted explanation instead of only a hover tooltip that reads
  // as an error.
  it('shows the note beside a flat ring when one is given, without waiting for a hover', () => {
    const wrapper = ring({
      categories: [],
      actions: [{ id: 'farm', label: 'Farm' }, { id: 'lumberjack', label: 'Lumberjack', disabled: true }],
      note: { title: "Why it's dim", body: 'Lumberjack needs forest. This hex is grass, so Farm is the fit here.' },
    });
    const note = wrapper.get('.ring-note');
    expect(note.text()).toContain("Why it's dim");
    expect(note.text()).toContain('Lumberjack needs forest');
  });

  it('shows no note when none is given', () => {
    const wrapper = ring({ categories: [], actions: [{ id: 'farm', label: 'Farm' }] });
    expect(wrapper.find('.ring-note').exists()).toBe(false);
  });

  it('shows no note for a drilled-in ring even when one is given — that ring has its own detail card', async () => {
    const wrapper = ring({ note: { title: 'x', body: 'y' } });
    await bubble(wrapper, 'Build').trigger('mouseenter');
    await bubble(wrapper, 'Housing').trigger('mouseenter');
    await bubble(wrapper, 'Hut').trigger('mouseenter');
    expect(wrapper.find('.ring-note').exists()).toBe(false);
    expect(wrapper.find('.ring-card').exists()).toBe(true);
  });

  // Design handoff "2a" frame 3: GuidancePointer.vue aims at the enabled
  // guided building's spot, read from this emit rather than duplicating
  // ringLayout's own placement maths in the caller.
  it('emits each lane1 bubble\'s screen spot by action id, including on the very first render', () => {
    const wrapper = ring({
      categories: [],
      actions: [{ id: 'farm', label: 'Farm' }, { id: 'lumberjack', label: 'Lumberjack', disabled: true }],
    });
    const events = wrapper.emitted('layout');
    expect(events).toBeTruthy();
    const spots = events![events!.length - 1][0] as Record<string, { x: number; y: number }>;
    expect(Object.keys(spots).sort()).toEqual(['farm', 'lumberjack']);
    const farmStyle = bubble(wrapper, 'Farm').attributes('style') ?? '';
    const left = parseFloat(/left:\s*([\d.]+)px/.exec(farmStyle)?.[1] ?? 'NaN');
    const top = parseFloat(/top:\s*([\d.]+)px/.exec(farmStyle)?.[1] ?? 'NaN');
    expect(spots.farm.x).toBeCloseTo(left);
    expect(spots.farm.y).toBeCloseTo(top);
  });

  it('re-emits layout when the menu is re-anchored on another tile', async () => {
    const wrapper = ring({ categories: [], actions: [{ id: 'farm', label: 'Farm' }] });
    const before = wrapper.emitted('layout')!.length;
    await wrapper.setProps({ x: 600, y: 420 });
    expect(wrapper.emitted('layout')!.length).toBeGreaterThan(before);
  });

  it('resets to the root when the menu is re-anchored on another tile', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('mouseenter');
    expect(labels(wrapper)).toContain('Housing');

    await wrapper.setProps({ x: 600, y: 420 });
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
  });
});
