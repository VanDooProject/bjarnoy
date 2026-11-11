// @vitest-environment jsdom
//
// The marker dial's elapsed arc: one linear animation of the hex outline's dash offset over the order's remaining time, so it
// flows instead of stepping once per polled second. Web Animations are the recording stand-in.
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuildingHudDial from './BuildingHudDial.vue';
import type { ConstructionDial } from '../../lib/map/constructionDial';
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
