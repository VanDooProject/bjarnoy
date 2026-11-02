// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HexTooltip from './HexTooltip.vue';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { buildingStatsFor } from '../../lib/map/buildingEconomy';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

const grass = (screenX: number, screenY: number): HoverInfo =>
  ({
    screenX,
    screenY,
    coord: { q: 1, r: 2 },
    subject: { kind: 'terrain', terrain: 'grass', wasted: false, isRiver: false },
  }) as HoverInfo;

describe('HexTooltip', () => {
  // The tooltip jumps on every hex change. Moving it with left/top re-laid
  // out and repainted the page over the WebGL map each time, which flashed
  // white rectangles beside the cursor on real GPUs.
  it('follows the hovered hex with a transform, not left/top', async () => {
    const wrapper = mount(HexTooltip, {
      props: { info: grass(300, 200) },
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });
    const el = wrapper.get('.hex-tooltip').element as HTMLElement;
    expect(el.style.transform).toBe('translate(312px, 200px) translateY(-50%)');

    await wrapper.setProps({ info: grass(420, 260) });
    expect(el.style.transform).toBe('translate(432px, 260px) translateY(-50%)');
    expect(el.style.left).toBe('');
    expect(el.style.top).toBe('');
    wrapper.unmount();
  });
});

describe('HexTooltip on a bridge', () => {
  const bridge = (level: number, owner: { mine: boolean; ownerId?: string }): HoverInfo =>
    ({
      screenX: 0,
      screenY: 0,
      coord: { q: 1, r: 2 },
      subject: { kind: 'building', buildingType: 'bridge', level },
      owner: { settlementName: 'Hvit', ownerName: 'Ulf', ...owner },
      premiumLocked: !owner.mine,
    }) as HoverInfo;
  const mountBridge = (info: HoverInfo, friendOwners?: ReadonlySet<string>) =>
    mount(HexTooltip, { props: { info, friendOwners }, global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } });

  it.each([
    [0, 'Building site'],
    [1, 'Causeway'],
    [2, 'Footbridge'],
    [3, "King's bridge"],
    [4, 'Guarded bridge'],
  ])('says in words what a level %i bridge does to a crossing army, to a stranger too', (level, name) => {
    const text = mountBridge(bridge(level, { mine: false, ownerId: 'u2' })).get('[data-testid="bridge-crossing"]').text();
    expect(text.startsWith(name)).toBe(true);
    expect(text).not.toMatch(/\d+(\.\d+)? ?(cost|h\b)/);
  });

  it('keeps the ordinary stats row off a bridge it already describes', () => {
    const wrapper = mountBridge({ ...bridge(2, { mine: true, ownerId: 'u1' }), stats: { modifier: { kind: 'bridge', level: 2 } } });
    expect(wrapper.findAll('dd').filter((dd) => dd.text().startsWith('Footbridge'))).toHaveLength(1);
  });

  it('tells a guarded bridge\'s owner, a friend and a stranger whether their armies may cross', () => {
    const friends = new Set(['u2']);
    expect(mountBridge(bridge(4, { mine: true, ownerId: 'u1' }), friends).get('[data-testid="bridge-access"]').text()).toBe('Your armies may cross');
    expect(mountBridge(bridge(4, { mine: false, ownerId: 'u2' }), friends).get('[data-testid="bridge-access"]').text()).toBe('Your armies may cross as a friend');
    expect(mountBridge(bridge(4, { mine: false, ownerId: 'u3' }), friends).get('[data-testid="bridge-access"]').text()).toBe('Your armies may not cross');
  });

  it('shows no access line for the open levels', () => {
    expect(mountBridge(bridge(3, { mine: false, ownerId: 'u3' })).find('[data-testid="bridge-access"]').exists()).toBe(false);
  });
});

describe('HexTooltip building stats match the backend rules', () => {
  const building = (buildingType: 'palisadegate' | 'tower', level: number): HoverInfo =>
    ({
      screenX: 0,
      screenY: 0,
      coord: { q: 1, r: 2 },
      subject: { kind: 'building', buildingType, level },
      stats: buildingStatsFor(buildingType, level),
      owner: { settlementName: 'Hvit', ownerName: 'Ulf', mine: true },
    }) as HoverInfo;
  const text = (info: HoverInfo) =>
    mount(HexTooltip, { props: { info }, global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } }).text();

  it('says a palisade gate opens for its owner, their guild and guilds at peace (PalisadeIndex.ForOwner)', () => {
    const t = text(building('palisadegate', 1));
    expect(t).toContain('guild');
    expect(t).toContain('at peace');
    expect(t).not.toContain('Only its owner');
  });

  it('shows a tower\'s visible radius (level + 1, FogVisionRadii.TowerVisibleRadius) and explored radius (level + 3)', () => {
    expect(text(building('tower', 4))).toContain('Vision radius 5 (explored 7)');
  });
});

describe('HexTooltip has no workers line', () => {
  it('shows output but no invented "Workers" row for a farm', () => {
    const info = {
      screenX: 0,
      screenY: 0,
      coord: { q: 1, r: 2 },
      subject: { kind: 'building', buildingType: 'farm', level: 2 },
      stats: buildingStatsFor('farm', 2),
      owner: { settlementName: 'Hvit', ownerName: 'Ulf', mine: true },
    } as HoverInfo;
    const text = mount(HexTooltip, { props: { info }, global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } }).text();
    expect(text).toContain('Food/h');
    expect(text).not.toContain('Workers');
  });
});
