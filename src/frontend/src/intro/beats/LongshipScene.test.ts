// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import LongshipScene, { FOG_TILE, ISLES_STRIP_WIDTH, SEA_WAVE_LEN } from './LongshipScene.vue';
import source from './LongshipScene.vue?raw';

/** The distance a `@keyframes b5-x…` loop moves (always `to { transform: translateX(-Npx) }`). */
function drift(name: string): number {
  const m = source.match(new RegExp(`@keyframes ${name}\\s+\\{[^\\n]*translateX\\((-?[\\d.]+)px\\)`));
  if (!m) throw new Error(`no translateX @keyframes ${name}`);
  return Math.abs(Number(m[1]));
}

describe('LongshipScene', () => {
  // The beat can be in the page twice at once (crossfade); shared ids would make masks and
  // patterns of one copy resolve to the other's, which vanish when it unmounts.
  it('gives each copy its own ids, and every reference stays inside its own copy', () => {
    const Both = defineComponent({ render: () => h('div', [h(LongshipScene), h(LongshipScene)]) });
    const w = mount(Both, { attachTo: document.body });
    const svgs = w.findAll('svg');
    expect(svgs).toHaveLength(2);
    const ids = svgs.map((s) => new Set(s.findAll('[id]').map((e) => e.attributes('id')!)));
    expect(ids[0].size).toBeGreaterThan(10);
    for (const id of ids[0]) expect(ids[1].has(id)).toBe(false);
    svgs.forEach((svg, i) => {
      for (const r of svg.html().matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) {
        const target = r[1] ?? r[2];
        if (target === 'intro-fog') continue; // the host's shared texture
        expect(ids[i].has(target), `${target} in copy ${i}`).toBe(true);
      }
    });
    w.unmount();
  });

  // A loop whose end frame differs from its start frame makes the layer jump at every restart.
  it('moves each sea band a whole number of its wave lengths per loop', () => {
    expect(drift('b5-x400') % SEA_WAVE_LEN.mid).toBe(0);
    expect(drift('b5-x480') % SEA_WAVE_LEN.near).toBe(0);
    expect(drift('b5-x800') % SEA_WAVE_LEN.fg1).toBe(0);
    expect(drift('b5-x960') % SEA_WAVE_LEN.fg2).toBe(0);
  });

  it('drifts the fog whole tiles per loop', () => {
    expect(drift('b5-x768') % FOG_TILE.hz).toBe(0);
    expect(drift('b5-x1024') % FOG_TILE.other).toBe(0);
    expect(drift('b5-x2048') % FOG_TILE.other).toBe(0);
  });

  it('moves the settlement strip exactly its own width', () => {
    expect(drift('b5-x1600')).toBe(ISLES_STRIP_WIDTH);
  });

  it('adds the landfall class only while landing', () => {
    const idle = mount(LongshipScene);
    expect(idle.find('svg').classes()).not.toContain('b5-landfall');
    const landing = mount(LongshipScene, { props: { landfall: true } });
    expect(landing.find('svg').classes()).toContain('b5-landfall');
  });
});
