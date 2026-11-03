// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import FireBeat from './FireBeat.vue';
import ProphecyBeat from './ProphecyBeat.vue';
import hallSource from './HallScene.vue?raw';
import prophecySource from './ProphecyBeat.vue?raw';

function keyframes(source: string, name: string): string {
  const m = source.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`));
  if (!m) throw new Error(`no @keyframes ${name}`);
  return m[1];
}
const translates = (frames: string) => [...frames.matchAll(/translate\((-?[\d.]+)(?:px)?, (-?[\d.]+)(?:px)?\)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('HallScene', () => {
  // During the 600 ms crossfade the fire and prophecy beats are both in the page.
  // Shared ids would make the prophecy's masks resolve to the fire beat's copies,
  // which vanish when that beat unmounts.
  it('gives each copy of the hall its own ids, and every reference stays inside its own copy', () => {
    const Both = defineComponent({ render: () => h('div', [h(FireBeat), h(ProphecyBeat)]) });
    const w = mount(Both, { attachTo: document.body });
    const svgs = w.findAll('svg');
    expect(svgs).toHaveLength(2);
    const ids = svgs.map((s) => new Set(s.findAll('[id]').map((e) => e.attributes('id')!)));
    for (const id of ids[0]) expect(ids[1].has(id)).toBe(false);
    svgs.forEach((svg, i) => {
      const refs = svg.html().matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g);
      for (const r of refs) {
        const target = r[1] ?? r[2];
        if (target === 'intro-fog') continue; // the host's shared texture
        expect(ids[i].has(target), `${target} in beat ${i}`).toBe(true);
      }
    });
    w.unmount();
  });

  // A loop whose end frame differs from its start frame makes the smoke jump at every restart.
  it('scrolls the smoke exactly one texture tile (512) per loop, and only upwards', () => {
    const [from, to] = translates(keyframes(hallSource, 'hall-rise'));
    expect(from).toEqual([0, 0]);
    expect(to[0]).toBe(0);
    expect(Math.abs(to[1]) % 512).toBe(0);
  });

  it('moves the vision waves exactly one wave length (80) per loop', () => {
    const [from, to] = translates(keyframes(prophecySource, 'prophecy-waves'));
    expect(from).toEqual([0, 0]);
    expect(Math.abs(to[0]) % 80).toBe(0);
    expect(to[1]).toBe(0);
  });
});
