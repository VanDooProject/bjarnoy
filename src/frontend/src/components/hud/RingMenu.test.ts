// @vitest-environment jsdom
//
// The 2a ring's navigation rules, which are uniform at every level: click goes
// deeper (hover never navigates, it only previews a card), click commits, and the hub (or the ‹ BACK bubble that owns a reserved slot on the
// inner lane) goes up exactly one level. Two of these are regressions the
// design pass reported by hand — a card appearing for a building nobody had
// hovered yet, and Escape throwing away a whole drill-down instead of
// stepping back out of it.
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RingMenu, { type RingCategory } from './RingMenu.vue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import { computeAvailability, type RingAvailabilityInput } from '../../lib/map/ringAvailability';

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
      { id: 'barracks', label: 'Barracks', cost: { wood: 130, stone: 110 }, time: '7:00', gives: 'Trains land troops' },
    ],
  },
];

function availability(overrides: Partial<RingAvailabilityInput> = {}) {
  return computeAvailability({
    cost: { wood: 100, stone: 80 },
    available: { wood: 1000, stone: 1000, food: 1000, iron: 1000 },
    slotsNeeded: 1,
    construction: { slots: 3, slotsUsed: 2, maxWaitingOrders: 0, waitingOrders: 0 },
    queue: [],
    locked: false,
    ...overrides,
  });
}

function ringWith(building: Record<string, unknown>, props: Record<string, unknown> = {}) {
  return ring({
    categories: [{ id: 'housing', label: 'Housing', color: 'var(--gold)', buildings: [{ id: 'hut', label: 'Hut', ...building }] }],
    ...props,
  });
}

async function hoverHut(wrapper: ReturnType<typeof ring>) {
  await bubble(wrapper, 'Build').trigger('click');
  await bubble(wrapper, 'Housing').trigger('click');
  await bubble(wrapper, 'Hut').trigger('mouseenter');
}

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

  it('drills into the categories on click, replacing the root lane rather than orbiting outside it', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    // Two lanes at most: the root actions are gone, the categories plus the
    // reserved back slot are what's on the inner lane now.
    expect(labels(wrapper)).toEqual(['Housing', 'Defense', '‹ BACK']);
    expect(wrapper.get('.ring-hub').text()).toContain('BUILD');
  });

  it('fans a category’s buildings out on click without committing anything', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');
    expect(labels(wrapper)).toContain('Watchtower');
    expect(labels(wrapper)).toContain('Barracks');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('shows no detail card until a building is genuinely hovered', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');
    // Regression: the card used to default to the first building, so opening a
    // category popped a card for something nobody had pointed at.
    expect(wrapper.find('.ring-card').exists()).toBe(false);

    await bubble(wrapper, 'Barracks').trigger('mouseenter');
    const card = wrapper.get('.ring-card');
    expect(card.text()).toContain('Barracks');
    expect(card.text()).toContain('7:00');
    expect(card.text()).toContain('Trains land troops');
  });

  it('marks a cost the player cannot afford, and refuses to build a locked building', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');
    await bubble(wrapper, 'Watchtower').trigger('mouseenter');

    // Stock is 150 stone and no iron; the watchtower needs 200 and 10. Wood
    // (120 of 150) is affordable and must not be marked.
    expect(wrapper.get('.ring-card').findAll('b.short').map((b) => b.text())).toEqual(['200', '10']);
    expect(wrapper.get('.ring-card').text()).toContain('REQUIRES LONGHOUSE 2');

    await bubble(wrapper, 'Watchtower').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('shows a non-blocking warning on the card and still lets the building be placed', async () => {
    const categories: RingCategory[] = [
      {
        id: 'defense',
        label: 'Defense',
        color: 'var(--iron)',
        buildings: [{ id: 'tower', label: 'Watchtower', cost: { wood: 1 }, warning: 'Wild beasts will burn this tower unless an army stands guard on it.' }],
      },
    ];
    const wrapper = ring({ categories });
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');
    await bubble(wrapper, 'Watchtower').trigger('mouseenter');

    expect(wrapper.get('[data-testid="ring-card-warning"]').text()).toContain('burn this tower');
    expect(wrapper.get('.ring-card').text()).toContain('BUILDABLE HERE');
    await bubble(wrapper, 'Watchtower').trigger('click');
    expect(wrapper.emitted('select')).toBeDefined();
  });

  it('commits a building on click', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');
    await bubble(wrapper, 'Barracks').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['barracks']]);
  });

  it('treats a touch tap as hover-then-click: first tap previews, second commits', async () => {
    // Touch has no hover, so a bare click would spend resources blind. The
    // first touch tap must do what mouseenter does on desktop — show the
    // card — without building anything. This listens on `touchstart` rather
    // than `pointerdown`: Chromium only suppresses the tap's compatibility
    // `click` when the touch event itself was canceled — verified for real
    // (not just that the handler ran) by e2e/ring-menu.spec.ts's touch test.
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');

    await bubble(wrapper, 'Barracks').trigger('touchstart');
    expect(wrapper.get('.ring-card').text()).toContain('Barracks');
    expect(wrapper.emitted('select')).toBeUndefined();

    // The building is now previewed; the next tap's click commits it.
    await bubble(wrapper, 'Barracks').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['barracks']]);
  });

  it('a touch tap previews a locked building but never commits it', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');

    await bubble(wrapper, 'Watchtower').trigger('touchstart');
    expect(wrapper.get('.ring-card').text()).toContain('REQUIRES LONGHOUSE 2');

    await bubble(wrapper, 'Watchtower').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('does not require a preview tap for a mouse click, which still commits immediately', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');

    // A mouse click never fires touchstart at all, so onBuildingTouchStart
    // never runs — this is the same interaction the pre-touch RingMenu had.
    await bubble(wrapper, 'Barracks').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['barracks']]);
  });

  it('emits a root action straight through instead of drilling', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Details').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['details']]);
  });

  it('goes up exactly one level from ‹ BACK and from the hub', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');
    expect(labels(wrapper)).toContain('Watchtower');

    await bubble(wrapper, '‹ BACK').trigger('click');
    expect(labels(wrapper)).toEqual(['Housing', 'Defense', '‹ BACK']);

    await wrapper.get('.ring-hub').trigger('click');
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('steps back out with Escape and only closes from the root', async () => {
    const wrapper = ring();
    await bubble(wrapper, 'Build').trigger('click');
    await bubble(wrapper, 'Defense').trigger('click');

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
        { id: 'build', label: 'Build', disabled: true, hint: 'Occupied by a giant landmark' },
      ],
    });
    await bubble(wrapper, 'Build').trigger('click');
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
  });

  it('shows no hint chip on a disabled action that has its own card, since the card lists the reasons', async () => {
    const wrapper = ring({
      actions: [
        {
          id: 'upgrade',
          label: 'Upgrade',
          disabled: true,
          hint: 'Needs 161 Wood',
          card: { title: 'Upgrade to level 2', availability: availability({ available: { wood: 0, stone: 0, food: 0, iron: 0 } }) },
        },
        { id: 'details', label: 'Details' },
      ],
    });
    await bubble(wrapper, 'Upgrade').trigger('mouseenter');
    expect(wrapper.find('.ring-card').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ring-hint"]').exists()).toBe(false);
  });

  it('explains a disabled action in a hint chip on hover, with aria kept and no native disabled attribute', async () => {
    // A native `disabled` button doesn't fire mouse events in most browsers,
    // so hover (and with it the chip) would never show. aria-disabled keeps
    // the "can't interact" semantics while leaving hover working.
    const wrapper = ring({
      actions: [
        { id: 'details', label: 'Details' },
        { id: 'raze', label: 'Raze', disabled: true, hint: "Can't raze the longhouse" },
      ],
    });
    const raze = bubble(wrapper, 'Raze');
    expect(raze.attributes('disabled')).toBeUndefined();
    expect(raze.attributes('aria-disabled')).toBe('true');
    expect(raze.attributes('aria-description')).toBe("Can't raze the longhouse");
    expect(raze.find('.ring-badge.ban').exists()).toBe(true);
    expect(raze.classes()).toContain('disabled');
    expect(wrapper.find('[data-testid="ring-hint"]').exists()).toBe(false);

    await raze.trigger('mouseenter');
    expect(wrapper.get('[data-testid="ring-hint"]').text()).toBe("Can't raze the longhouse");
    await raze.trigger('mouseleave');
    expect(wrapper.find('[data-testid="ring-hint"]').exists()).toBe(false);

    await raze.trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
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

  // Design handoff "2a" frame 3: GuidancePointer.vue aims at the enabled
  // guided building's spot, read from this emit rather than duplicating
  // ringLayout's own placement maths in the caller.
  it('emits the Build hub, then the categories, then the opened category\'s buildings, so a pointer can follow the player in', async () => {
    const wrapper = ring();
    const last = () => Object.keys(wrapper.emitted('layout')!.at(-1)![0] as Record<string, unknown>);
    expect(last()).toContain('build');
    await bubble(wrapper, 'Build').trigger('click');
    expect(last()).toEqual(expect.arrayContaining(['housing', 'defense']));
    expect(last()).not.toContain('hut');
    await bubble(wrapper, 'Housing').trigger('click');
    expect(last()).toEqual(expect.arrayContaining(['housing', 'defense', 'hut']));
  });

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
    await bubble(wrapper, 'Build').trigger('click');
    expect(labels(wrapper)).toContain('Housing');

    await wrapper.setProps({ x: 600, y: 420 });
    expect(labels(wrapper)).toEqual(['Details', 'Build']);
  });

  // The top HUD bar takes its own clicks (none reach the backdrop behind it),
  // so a press on it has to close the ring by itself — without emitting
  // `outsidePointerDown`, which would start a map drag.
  it('closes on a press anywhere on the top HUD bar, and only there', () => {
    const bar = document.createElement('header');
    bar.className = 'hud-bar';
    const inBar = document.createElement('span');
    bar.appendChild(inBar);
    const elsewhere = document.createElement('div');
    document.body.append(bar, elsewhere);
    const wrapper = ring();

    elsewhere.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('close')).toBeUndefined();

    inBar.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('outsidePointerDown')).toBeUndefined();

    wrapper.unmount();
    inBar.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    bar.remove();
    elsewhere.remove();
  });

  describe('click-only navigation', () => {
    it('does not open the categories on hovering Build, nor a category’s buildings on hovering it', async () => {
      const wrapper = ring();
      await bubble(wrapper, 'Build').trigger('mouseenter');
      expect(labels(wrapper)).toEqual(['Details', 'Build']);

      await bubble(wrapper, 'Build').trigger('click');
      await bubble(wrapper, 'Defense').trigger('mouseenter');
      expect(labels(wrapper)).toEqual(['Housing', 'Defense', '‹ BACK']);

      await bubble(wrapper, 'Defense').trigger('click');
      expect(labels(wrapper)).toContain('Barracks');
    });

    it('still previews a hovered building’s card, which is information rather than navigation', async () => {
      const wrapper = ring();
      await bubble(wrapper, 'Build').trigger('click');
      await bubble(wrapper, 'Defense').trigger('click');
      await bubble(wrapper, 'Barracks').trigger('mouseenter');
      expect(wrapper.find('.ring-card').exists()).toBe(true);
    });
  });

  describe('availability', () => {
    it('has no BUILD button on the card, locked or not', async () => {
      const wrapper = ring();
      await bubble(wrapper, 'Build').trigger('click');
      await bubble(wrapper, 'Defense').trigger('click');
      for (const label of ['Barracks', 'Watchtower']) {
        await bubble(wrapper, label).trigger('mouseenter');
        expect(wrapper.get('.ring-card').find('button').exists()).toBe(false);
        expect(wrapper.get('.ring-card').text()).not.toMatch(/click to build/i);
      }
    });

    it('marks a locked building with a lock badge and keeps it unclickable', async () => {
      const wrapper = ringWith({ locks: ['Requires Barracks level 2'], availability: availability({ locked: true }) });
      await bubble(wrapper, 'Build').trigger('click');
      await bubble(wrapper, 'Housing').trigger('click');
      const hut = bubble(wrapper, 'Hut');
      expect(hut.classes()).toContain('locked');
      expect(hut.find('.ring-badge.locked').exists()).toBe(true);
      await hut.trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('puts the lock on a category whose every building is locked, and still opens it', async () => {
      const wrapper = ring({
        categories: [
          ...CATEGORIES,
          {
            id: 'shrines',
            label: 'Shrines',
            color: 'var(--gold)',
            buildings: [
              { id: 'thor', label: 'Thor', lock: 'Requires longhouse 4' },
              { id: 'freyja', label: 'Freyja', locks: ['Requires longhouse 5'] },
            ],
          },
        ],
      });
      await bubble(wrapper, 'Build').trigger('click');
      const shrines = bubble(wrapper, 'Shrines');
      expect(shrines.classes()).toContain('is-locked');
      expect(shrines.find('.ring-badge.locked').exists()).toBe(true);
      // Only one of Defense's two buildings is locked: no lock on the category.
      expect(bubble(wrapper, 'Defense').find('.ring-badge').exists()).toBe(false);
      expect(bubble(wrapper, 'Housing').find('.ring-badge').exists()).toBe(false);

      await shrines.trigger('click');
      expect(labels(wrapper)).toEqual(expect.arrayContaining(['Thor', 'Freyja']));
    });

    it('marks a building short on resources as waiting (clock badge), says what is missing, and refuses the click', async () => {
      const wrapper = ringWith(
        {
          cost: { wood: 100, stone: 80 },
          availability: availability({ available: { wood: 70, stone: 80, food: 0, iron: 0 } }),
        },
        {},
      );
      await hoverHut(wrapper);
      const hut = bubble(wrapper, 'Hut');
      expect(hut.classes()).toContain('waiting');
      expect(hut.classes()).not.toContain('locked');
      expect(hut.find('.ring-badge.waiting').exists()).toBe(true);
      expect(hut.attributes('aria-disabled')).toBe('true');
      // The badge adds no text, not even whitespace: specs and screen readers read the label as-is.
      expect(hut.element.textContent).toBe('Hut');

      const card = wrapper.get('.ring-card');
      expect(card.text()).toContain('NOT ENOUGH RESOURCES');
      expect(card.text()).toContain('Need 30 Wood');
      expect(card.findAll('b.short').map((b) => b.text())).toEqual(['100']);

      await hut.trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('shows full slots as the same waiting look, with the free count and time until the next slot', async () => {
      const wrapper = ringWith({
        availability: availability({
          construction: { slots: 3, slotsUsed: 3, maxWaitingOrders: 0, waitingOrders: 0 },
          queue: [
            { state: 'building', completesInSeconds: 192 },
            { state: 'building', completesInSeconds: 400 },
          ],
        }),
      });
      await hoverHut(wrapper);
      const hut = bubble(wrapper, 'Hut');
      expect(hut.classes()).toContain('waiting');
      expect(hut.find('.ring-badge.waiting').exists()).toBe(true);
      const card = wrapper.get('.ring-card');
      expect(card.text()).toContain('NO FREE BUILD SLOT');
      expect(card.get('[data-testid="ring-card-slots"]').text()).toBe('1 · 0 of 3 free');
      expect(card.get('[data-testid="ring-card-status"]').text()).toBe('Needs 1 build slot · 0 of 3 free · next free in 3:12');
      await hut.trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('drops the next-free time when it is unknown and pluralises the slots', async () => {
      const wrapper = ringWith({
        availability: availability({
          slotsNeeded: 2,
          construction: { slots: 3, slotsUsed: 2, maxWaitingOrders: 0, waitingOrders: 0 },
        }),
      });
      await hoverHut(wrapper);
      expect(wrapper.get('[data-testid="ring-card-status"]').text()).toBe('Needs 2 build slots · 1 of 3 free');
      expect(wrapper.get('[data-testid="ring-card-slots"]').text()).toBe('2 · 1 of 3 free');
    });

    it('says “All (n)” for a building that takes every slot', async () => {
      const wrapper = ringWith({
        availability: availability({
          slotsNeeded: 3,
          construction: { slots: 3, slotsUsed: 2, maxWaitingOrders: 0, waitingOrders: 0 },
        }),
      });
      await hoverHut(wrapper);
      expect(wrapper.get('[data-testid="ring-card-slots"]').text()).toBe('All (3) · 1 of 3 free');
    });

    it('lets a premium player queue when slots are full, with a gold footer, and no clock badge', async () => {
      const wrapper = ringWith({
        availability: availability({
          construction: { slots: 3, slotsUsed: 3, maxWaitingOrders: 3, waitingOrders: 1 },
        }),
      });
      await hoverHut(wrapper);
      const hut = bubble(wrapper, 'Hut');
      expect(hut.classes()).not.toContain('waiting');
      expect(hut.find('.ring-badge').exists()).toBe(false);
      const status = wrapper.get('[data-testid="ring-card-status"]');
      expect(status.text()).toBe('Will queue behind current builds (1 of 3 waiting)');
      expect(status.get('li').classes()).toContain('queue');
      await hut.trigger('click');
      expect(wrapper.emitted('select')).toEqual([['hut']]);
    });

    it('lists every blocker, lock first, and shows no footer for a building that can be built straight away', async () => {
      const blocked = ringWith({
        locks: ['Requires longhouse 4', 'Requires Barracks level 2'],
        availability: availability({
          locked: true,
          available: { wood: 70, stone: 80, food: 0, iron: 0 },
          construction: { slots: 2, slotsUsed: 2, maxWaitingOrders: 0, waitingOrders: 0 },
        }),
      });
      await hoverHut(blocked);
      const lines = blocked.get('[data-testid="ring-card-status"]').findAll('li').map((li) => li.text());
      expect(lines).toEqual([
        'Requires longhouse 4',
        'Requires Barracks level 2',
        'Need 30 Wood',
        'Needs 1 build slot · 0 of 2 free',
      ]);

      const free = ringWith({ availability: availability() });
      await hoverHut(free);
      expect(free.find('[data-testid="ring-card-status"]').exists()).toBe(false);
      expect(free.get('.ring-card').text()).toContain('BUILDABLE HERE');
      expect(free.get('.ring-card').text()).toContain('Level 1');
      expect(free.get('.ring-card').text()).not.toContain('ready');
    });
  });

  describe('root bubble cards', () => {
    const upgradeCard = {
      title: 'Longhouse',
      sub: 'Level 1 → 2',
      cost: { wood: 161, stone: 134, food: 81 },
      time: '15:00',
      availability: availability({ cost: { wood: 161, stone: 134, food: 81 }, available: { wood: 0, stone: 0, food: 0, iron: 0 } }),
    };

    it('shows the upgrade card while the Upgrade bubble is hovered, even though it is not clickable', async () => {
      const wrapper = ring({
        actions: [
          { id: 'upgrade', label: 'Upgrade', disabled: true, state: 'waiting', card: upgradeCard },
          { id: 'details', label: 'Details' },
        ],
      });
      const upgrade = bubble(wrapper, 'Upgrade');
      expect(wrapper.find('.ring-card').exists()).toBe(false);
      expect(upgrade.find('.ring-badge.waiting').exists()).toBe(true);
      expect(upgrade.classes()).not.toContain('disabled');

      await upgrade.trigger('mouseenter');
      const card = wrapper.get('.ring-card');
      expect(card.text()).toContain('Longhouse');
      expect(card.text()).toContain('Level 1 → 2');
      expect(card.text()).toContain('161');
      expect(card.text()).toContain('15:00');
      expect(card.text()).toContain('Need 161 Wood · 134 Stone · 81 Food');

      await upgrade.trigger('mouseleave');
      expect(wrapper.find('.ring-card').exists()).toBe(false);

      await upgrade.trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('rounds a fractional (scaled) cost up on the chips', async () => {
      const wrapper = ring({
        actions: [{ id: 'upgrade', label: 'Upgrade', card: { title: 'Upgrade to level 2', cost: { wood: 160.8, food: 80.4 } } }],
      });
      await bubble(wrapper, 'Upgrade').trigger('mouseenter');
      expect(wrapper.get('.ring-card').findAll('.chip b').map((b) => b.text())).toEqual(['161', '81']);
    });

    it('shows a lock badge on a locked Upgrade bubble', () => {
      const wrapper = ring({
        actions: [{ id: 'upgrade', label: 'Upgrade', disabled: true, state: 'locked', card: { ...upgradeCard, locks: ['Requires longhouse 3'] } }],
      });
      expect(bubble(wrapper, 'Upgrade').find('.ring-badge.locked').exists()).toBe(true);
    });

    it('shows an info card for Details while hovered, and Details still selects on click', async () => {
      const wrapper = ring({
        actions: [
          {
            id: 'details',
            label: 'Details',
            info: { title: 'Farm', sub: 'Level 3', rows: [{ label: 'Output', value: '+72 food/h' }] },
          },
        ],
      });
      await bubble(wrapper, 'Details').trigger('mouseenter');
      const card = wrapper.get('.ring-card');
      expect(card.text()).toContain('Farm');
      expect(card.text()).toContain('Level 3');
      expect(card.text()).toContain('+72 food/h');
      expect(card.find('button').exists()).toBe(false);

      await bubble(wrapper, 'Details').trigger('click');
      expect(wrapper.emitted('select')).toEqual([['details']]);
    });
  });

  describe('rejected builds', () => {
    it('shows the server message on the card and keeps the ring open', async () => {
      const wrapper = ringWith({ availability: availability() }, { error: 'No free construction slot.' });
      await hoverHut(wrapper);
      expect(wrapper.get('[data-testid="ring-error"]').text()).toBe('No free construction slot.');
      expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('shows the message as a chip when no card is up', () => {
      const wrapper = ring({ error: 'No free construction slot.' });
      expect(wrapper.get('[data-testid="ring-error"]').text()).toBe('No free construction slot.');
    });
  });

  describe('touch: arm, then commit', () => {
    it('arms a building on the first tap with a visible ring, a “2” badge and a tap-again hint', async () => {
      const wrapper = ringWith({ availability: availability() });
      await bubble(wrapper, 'Build').trigger('click');
      await bubble(wrapper, 'Housing').trigger('click');
      const hut = bubble(wrapper, 'Hut');
      expect(hut.classes()).not.toContain('armed');

      await hut.trigger('touchstart');
      expect(hut.classes()).toContain('armed');
      expect(hut.classes()).not.toContain('blocked');
      expect(hut.find('[data-testid="ring-arm-badge"]').exists()).toBe(true);
      // The badge's digit is CSS, so the bubble's label is unchanged.
      expect(hut.text()).toBe('Hut');
      expect(wrapper.get('[data-testid="ring-tap-hint"]').text()).toBe('Tap Hut again to build');
      expect(wrapper.emitted('select')).toBeUndefined();

      // Second tap on the same bubble: touchstart lets the click through, which commits.
      await hut.trigger('touchstart');
      await hut.trigger('click');
      expect(wrapper.emitted('select')).toEqual([['hut']]);
    });

    it('shows the reasons instead of the hint for an armed blocked building, and never commits it', async () => {
      const wrapper = ringWith({ availability: availability({ available: { wood: 0, stone: 0, food: 0, iron: 0 } }) });
      await bubble(wrapper, 'Build').trigger('click');
      await bubble(wrapper, 'Housing').trigger('click');
      const hut = bubble(wrapper, 'Hut');
      await hut.trigger('touchstart');
      expect(hut.classes()).toContain('armed');
      // Armed for its card, but `blocked` drops the gold ring: a second tap would do nothing here.
      expect(hut.classes()).toContain('blocked');
      // No "2" badge either.
      expect(hut.find('[data-testid="ring-arm-badge"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="ring-tap-hint"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="ring-card-status"]').text()).toContain('Need 100 Wood · 80 Stone');
      await hut.trigger('touchstart');
      await hut.trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('moves the arm to another bubble on a tap there', async () => {
      const wrapper = ring();
      await bubble(wrapper, 'Build').trigger('click');
      await bubble(wrapper, 'Defense').trigger('click');
      await bubble(wrapper, 'Barracks').trigger('touchstart');
      await bubble(wrapper, 'Watchtower').trigger('touchstart');
      expect(bubble(wrapper, 'Barracks').classes()).not.toContain('armed');
      expect(bubble(wrapper, 'Watchtower').classes()).toContain('armed');
      expect(wrapper.get('.ring-card').text()).toContain('Watchtower');
    });

    it('arms Upgrade and Details on the first tap and commits on the second', async () => {
      const wrapper = ring({
        actions: [
          { id: 'upgrade', label: 'Upgrade', card: { title: 'Upgrade to level 2', availability: availability() } },
          { id: 'details', label: 'Details', info: { title: 'Longhouse', rows: [] } },
          { id: 'build', label: 'Build' },
        ],
      });
      const upgrade = bubble(wrapper, 'Upgrade');
      await upgrade.trigger('touchstart');
      expect(upgrade.classes()).toContain('armed');
      expect(wrapper.get('.ring-card').text()).toContain('Upgrade to level 2');
      expect(wrapper.get('[data-testid="ring-tap-hint"]').text()).toBe('Tap Upgrade again to upgrade');

      const details = bubble(wrapper, 'Details');
      await details.trigger('touchstart');
      expect(upgrade.classes()).not.toContain('armed');
      expect(wrapper.get('[data-testid="ring-tap-hint"]').text()).toBe('Tap Details again for all details');
      await details.trigger('touchstart');
      await details.trigger('click');
      expect(wrapper.emitted('select')).toEqual([['details']]);
    });

    it('never arms a bubble without a card: Build still opens on the first tap', async () => {
      const wrapper = ring();
      await bubble(wrapper, 'Build').trigger('touchstart');
      expect(bubble(wrapper, 'Build').classes()).not.toContain('armed');
      await bubble(wrapper, 'Build').trigger('click');
      expect(labels(wrapper)).toContain('Housing');
    });

    it('does not arm on a mouse hover', async () => {
      const wrapper = ringWith({ availability: availability() });
      await hoverHut(wrapper);
      expect(bubble(wrapper, 'Hut').classes()).not.toContain('armed');
      expect(wrapper.find('[data-testid="ring-tap-hint"]').exists()).toBe(false);
    });
  });

  describe('docked card (phone layout)', () => {
    for (const dock of ['bottom', 'left', 'right'] as const) {
      it(`docks the card to the ${dock} edge instead of floating it`, async () => {
        const wrapper = ringWith({ availability: availability() }, { dock });
        await bubble(wrapper, 'Build').trigger('click');
        await bubble(wrapper, 'Housing').trigger('click');
        await bubble(wrapper, 'Hut').trigger('touchstart');
        const card = wrapper.get('.ring-card');
        expect(card.classes()).toContain(`docked-${dock}`);
        expect(card.attributes('data-dock')).toBe(dock);
        expect(card.attributes('style') ?? '').not.toContain('left:');
        expect(card.find('button').exists()).toBe(false);
      });
    }
  });
});
