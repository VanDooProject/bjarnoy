// @vitest-environment jsdom
//
// The marker dial's elapsed arc: one linear animation of the hex outline's dash offset over the order's remaining time, so it
// flows instead of stepping once per polled second. Web Animations are the recording stand-in.
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuildingHudDial from './BuildingHudDial.vue';
import { CONSTRUCTION_DIAL_REJECT_COLOR, type ConstructionDial } from '../../lib/map/constructionDial';
import { animationPreference } from '../../lib/perf/animationPreference';
import { motionPreferences } from '../../lib/perf/motionPreferences';
import { installFakeAnimate, type FakeAnimate } from '../../test/fakeAnimate';

const NOW = 1_700_000_000_000;
const running = (startMs: number, endMs: number): ConstructionDial => ({
  coord: { q: 1, r: 1 },
  startMs,
  endMs,
  state: 'building',
  queuePosition: null,
});

describe('BuildingHudDial arc', () => {
  let wrapper: VueWrapper | undefined;
  let fake: FakeAnimate | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    fake?.restore();
    fake = undefined;
    motionPreferences.hud = 'auto';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mountDial = (props: Record<string, unknown>) => {
    wrapper = mount(BuildingHudDial, { props: { radius: 27.5, ring: 'upgrading', ...props } });
    return wrapper;
  };
  const arc = () => wrapper!.find('path.hud-dial__arc');

  it('starts one linear animation of the dash offset from the elapsed share to the full ring, over the remaining time', async () => {
    fake = installFakeAnimate();
    // A quarter done, 90 s to go.
    mountDial({ order: running(NOW - 30_000, NOW + 90_000), progress: 0.25 });
    await wrapper!.vm.$nextTick();
    const arcs = fake.animations.filter((a) => a.target === arc().element);
    expect(arcs).toHaveLength(1);
    const [from, to] = arcs[0]!.frames;
    expect(from!.strokeDashoffset).toBeCloseTo(0.75, 6);
    expect(to!.strokeDashoffset).toBe(0);
    expect(arcs[0]!.timing).toMatchObject({ duration: 90_000, easing: 'linear', fill: 'forwards' });
    // The outline is one hex path of length 1, dashed so that `1 - offset` of it shows.
    // A closed path from the top vertex, clockwise (not a polyline: WebKit mis-draws dashes on those).
    expect(arc().attributes('d')).toMatch(/^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+){5} Z$/);
    expect(arc().attributes('pathLength')).toBe('1');
    expect(arc().attributes('stroke-dasharray')).toBe('1 1');
  });

  it('does not restart on the per-second progress updates, but does when the order changes', async () => {
    fake = installFakeAnimate();
    const order = running(NOW - 30_000, NOW + 90_000);
    mountDial({ order, progress: 0.25 });
    await wrapper!.vm.$nextTick();
    await wrapper!.setProps({ progress: 0.26 });
    expect(fake.animations).toHaveLength(1);
    await wrapper!.setProps({ order: running(NOW - 30_000, NOW + 60_000) });
    expect(fake.animations).toHaveLength(2);
    expect(fake.animations[0]!.playState).toBe('idle');
    expect(fake.animations[1]!.timing.duration).toBe(60_000);
    wrapper!.unmount();
    wrapper = undefined;
    expect(fake.animations[1]!.playState).toBe('idle');
  });

  it('still flows when the HUD plays reduced motion: the arc is information, not decoration', async () => {
    fake = installFakeAnimate();
    vi.spyOn(animationPreference, 'reducedMotion', 'get').mockReturnValue(true);
    motionPreferences.hud = 'off';
    mountDial({ order: running(NOW - 30_000, NOW + 90_000), progress: 0.25 });
    await wrapper!.vm.$nextTick();
    expect(fake.animations).toHaveLength(1);
  });

  it('sets the static offset where Web Animations are missing, and without order times falls back to the polled progress', async () => {
    mountDial({ order: running(NOW - 30_000, NOW + 90_000), progress: 0.1 });
    await wrapper!.vm.$nextTick();
    expect(Number(arc().attributes('stroke-dashoffset'))).toBeCloseTo(0.75, 6);
    wrapper!.unmount();
    mountDial({ progress: 0.4 });
    expect(Number(arc().attributes('stroke-dashoffset'))).toBeCloseTo(0.6, 6);
  });

  it('draws no arc without progress or on the neutral ring', () => {
    mountDial({ progress: 0 });
    expect(arc().exists()).toBe(false);
    wrapper!.unmount();
    mountDial({ ring: 'none', progress: 0.5 });
    expect(arc().exists()).toBe(false);
  });

  it('animates nothing while an order only waits (no times)', async () => {
    fake = installFakeAnimate();
    mountDial({ order: { ...running(NOW, NOW), startMs: null, endMs: null, state: 'queued', queuePosition: 1 }, label: '#1' });
    await wrapper!.vm.$nextTick();
    expect(fake.animations).toHaveLength(0);
    expect(arc().exists()).toBe(false);
  });
});

describe('BuildingHudDial blocked refusal', () => {
  let wrapper: VueWrapper | undefined;
  const RED = `#${CONSTRUCTION_DIAL_REJECT_COLOR.toString(16).padStart(6, '0')}`;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    motionPreferences.hud = 'auto';
    vi.useRealTimers();
  });

  // The track is the dial's outline: the last plain stroked polygon of the dial body.
  const track = (w: VueWrapper) => w.findAll('polygon').filter((p) => p.attributes('fill') === 'none').at(-1)!;

  it('turns a green ring red while the refusal plays, and green again once it has played out on its own', async () => {
    wrapper = mount(BuildingHudDial, { props: { radius: 20, ring: 'ready', label: '3', blockedAtMs: NOW } });
    expect(track(wrapper).attributes('stroke')?.toLowerCase()).toBe(RED);

    vi.advanceTimersByTime(1_600);
    await wrapper.vm.$nextTick();
    expect(track(wrapper).attributes('stroke')?.toLowerCase()).toBe('#5fd08a');
  });

  it('turns the ring red with the HUD motion off too, and back afterwards', async () => {
    motionPreferences.hud = 'off';
    wrapper = mount(BuildingHudDial, { props: { radius: 20, ring: 'ready', label: '3', blockedAtMs: NOW } });
    expect(track(wrapper).attributes('stroke')?.toLowerCase()).toBe(RED);

    vi.advanceTimersByTime(1_600);
    await wrapper.vm.$nextTick();
    expect(track(wrapper).attributes('stroke')?.toLowerCase()).toBe('#5fd08a');
  });
});

describe('BuildingHudDial quick look: the level hex and the switch', () => {
  let wrapper: VueWrapper | undefined;
  let fake: FakeAnimate | undefined;
  const R = 27.5;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    fake?.restore();
    fake = undefined;
    motionPreferences.hud = 'auto';
    vi.restoreAllMocks();
  });

  const mountDial = (props: Record<string, unknown>) => {
    wrapper = mount(BuildingHudDial, { props: { radius: R, ring: 'ready', level: 7, label: '7', ...props }, attachTo: document.body });
    return wrapper;
  };
  const levelHex = () => wrapper!.find('.hud-dial__level');
  const centre = (points: string) => {
    const pts = points.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] as const;
  };

  it('draws the level in a hex on the dial\'s lower right corner point, in the ring colour, only while a glyph shows', () => {
    mountDial({ glyph: 'up', label: '' });
    const hex = levelHex();
    expect(hex.exists()).toBe(true);
    expect(hex.find('text').text()).toBe('7');
    expect(hex.find('polygon[fill="none"]').attributes('stroke')).toBe('#5fd08a');
    // At rest it is the dial's copy at 0.6 scale, moved to the corner point (0.866 R, 0.5 R, times 0.98).
    const style = hex.attributes('style')!;
    expect(style).toContain('scale(0.6)');
    expect(style).toContain(`translate(${(0.866 * R * 0.98).toFixed(2)}px, ${(0.5 * R * 0.98).toFixed(2)}px)`);
    wrapper!.unmount();
    mountDial({ label: '7' });
    expect(levelHex().exists()).toBe(false);
  });

  it('keeps the dial where it was: the hex is centred on the svg centre, and the svg size does not depend on the glyph', async () => {
    mountDial({});
    const plain = wrapper!.get('svg');
    const size = plain.attributes('width');
    const centrePlain = centre(plain.get('polygon.hud-dial__body').attributes('points')!);
    await wrapper!.setProps({ glyph: 'wait', label: '' });
    expect(wrapper!.get('svg').attributes('width')).toBe(size);
    expect(centre(wrapper!.get('polygon.hud-dial__body').attributes('points')!)).toEqual(centrePlain);
    expect(centrePlain[0]).toBeCloseTo(Number(size) / 2, 1);
  });

  it('slides a copy of the dial to the corner when the glyph comes on, over 450 ms', async () => {
    fake = installFakeAnimate();
    mountDial({});
    await wrapper!.setProps({ glyph: 'up', label: '' });
    await wrapper!.vm.$nextTick();
    const copy = fake.animations.find((a) => a.target === levelHex().element)!;
    expect(copy.timing).toMatchObject({ duration: 450, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'both', direction: 'normal' });
    expect(copy.frames[0]!.transform).toBe('translate(0px, 0px) scale(1)');
    expect(copy.frames[1]!.transform).toContain('scale(0.6)');
    // The dial turns gold and the glyph fades in, starting 120 ms in.
    const body = fake.animations.find((a) => a.target === wrapper!.get('.hud-dial__body').element)!;
    expect(body.frames.map((f) => f.fill)).toEqual(['#0b1720', '#ffc55c']);
    const glyph = fake.animations.find((a) => a.target === wrapper!.get('.hud-dial__glyph').element)!;
    expect(glyph.frames[1]).toMatchObject({ opacity: 0, offset: 120 / 450 });
    expect(glyph.frames[2]).toMatchObject({ opacity: 1, offset: 1 });
    fake.finishAll();
    expect(fake.running()).toHaveLength(0);
    expect(levelHex().exists()).toBe(true);
  });

  it('plays the reverse when the glyph goes away, then shows the plain dial; a change mid-way reverses from where it is', async () => {
    fake = installFakeAnimate();
    mountDial({});
    await wrapper!.setProps({ glyph: 'up', label: '' });
    await wrapper!.vm.$nextTick();
    // Mid-way out of the switch-in: the same animations run backwards.
    const inAnims = fake.animations.slice();
    await wrapper!.setProps({ glyph: undefined, label: '7' });
    expect(fake.animations).toHaveLength(inAnims.length);
    expect(inAnims.every((a) => a.reversed && a.playState === 'running')).toBe(true);
    expect(levelHex().exists()).toBe(true);
    // And back in again.
    await wrapper!.setProps({ glyph: 'up', label: '' });
    expect(inAnims.every((a) => !a.reversed)).toBe(true);
    // Out for good: from the settled state a reverse set of animations plays, and the dial is plain when it lands.
    fake.finishAll();
    const before = fake.animations.length;
    await wrapper!.setProps({ glyph: undefined, label: '7' });
    const out = fake.animations.slice(before);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((a) => a.timing.direction === 'reverse' && a.timing.duration === 450)).toBe(true);
    expect(levelHex().exists()).toBe(true);
    expect(wrapper!.find('.hud-dial__glyph').exists()).toBe(true);
    fake.finishAll();
    await wrapper!.vm.$nextTick();
    expect(levelHex().exists()).toBe(false);
    expect(wrapper!.find('.hud-dial__glyph').exists()).toBe(false);
  });

  it('swaps up and wait without the switch animation', async () => {
    fake = installFakeAnimate();
    mountDial({ glyph: 'up', label: '' });
    await wrapper!.setProps({ glyph: 'wait' });
    await wrapper!.vm.$nextTick();
    expect(fake.animations).toHaveLength(0);
    expect(wrapper!.find('.hud-dial__glyph--wait').exists()).toBe(true);
  });

  it('starts no animation when it mounts already in the quick look', async () => {
    fake = installFakeAnimate();
    mountDial({ glyph: 'up', label: '' });
    await wrapper!.vm.$nextTick();
    expect(fake.animations).toHaveLength(0);
    expect(levelHex().exists()).toBe(true);
  });

  it('shows the end state at once, without animations, when the HUD plays reduced motion', async () => {
    fake = installFakeAnimate();
    motionPreferences.hud = 'off';
    mountDial({});
    await wrapper!.setProps({ glyph: 'up', label: '' });
    await wrapper!.vm.$nextTick();
    expect(fake.animations).toHaveLength(0);
    expect(levelHex().exists()).toBe(true);
    expect(wrapper!.find('.hud-dial__glyph--up').exists()).toBe(true);
    await wrapper!.setProps({ glyph: undefined, label: '7' });
    expect(fake.animations).toHaveLength(0);
    expect(levelHex().exists()).toBe(false);
    expect(wrapper!.find('.hud-dial__glyph').exists()).toBe(false);
  });
});
