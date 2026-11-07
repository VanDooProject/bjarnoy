// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import RavensScene from './RavensScene.vue';
import ravensSource from './RavensScene.vue?raw';
import longshipSource from './LongshipScene.vue?raw';

describe('RavensScene', () => {
  // The host crossfades beats, so the scene can be in the page twice; shared ids would make one copy's
  // gradients, mask and fog resolve to the other's and vanish when it unmounts.
  it('gives each copy its own ids, and every reference stays inside its own copy', () => {
    const Both = defineComponent({ render: () => h('div', [h(RavensScene), h(RavensScene)]) });
    const w = mount(Both, { attachTo: document.body });
    const svgs = w.findAll('svg');
    expect(svgs).toHaveLength(2);
    const ids = svgs.map((s) => new Set(s.findAll('[id]').map((e) => e.attributes('id')!)));
    expect(ids[0].size).toBeGreaterThan(4);
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

  it('pauses with the host', () => {
    expect(mount(RavensScene, { props: { paused: true } }).find('svg').classes()).toContain('is-paused');
    expect(mount(RavensScene).find('svg').classes()).not.toContain('is-paused');
  });
});

// The push into the moon is a match cut: the ship it ends on has to be the fog hold's ship, at the same place and
// size, or it jumps when the host crossfades to the hold. Both scenes place it with CSS, so this reads their styles.
describe('RavensScene → LongshipScene match cut', () => {
  const num = (s: string) => Number(s.replace('px', ''));
  const pair = (s: string) => s.split(/[\s,]+/).filter(Boolean).map(num) as [number, number];
  // a point of the ship's local drawing in viewBox units at the end of the ravens beat
  function ravensEnd([x, y]: [number, number]): [number, number] {
    const ship = ravensSource.match(/88%, 100% \{ transform: translate\(([^)]+)\) scale\(([\d.]+)\) \}/)!;
    const [tx, ty] = pair(ship[1]);
    const k = Number(ship[2]);
    const origin = pair(ravensSource.match(/\.b4 \.b4-zoom \{[^}]*transform-origin: ([^;]+);/)![1]);
    const zoom = ravensSource.match(/99%, 100% \{ transform: translate\(([^)]+)\) scale\((\d+)\) \}/)!;
    const [dx, dy] = pair(zoom[1]);
    const z = Number(zoom[2]);
    const p = [tx + k * x, ty + k * y];
    return [origin[0] + dx + z * (p[0] - origin[0]), origin[1] + dy + z * (p[1] - origin[1])];
  }
  // the same point in the fog hold's first frame (ship frame, then the heave's start inside it)
  function holdStart([x, y]: [number, number]): [number, number] {
    const frame = longshipSource.match(/\.b5 \.ship-frame \{ transform-origin: ([^;]+); transform: translate\(([^)]+)\) scale\(([\d.]+)\); \}/)!;
    const origin = pair(frame[1]);
    const [tx, ty] = pair(frame[2]);
    const s = Number(frame[3]);
    const heave = num(longshipSource.match(/@keyframes b5-heave \{ 0%,100% \{ transform: translateY\(([-\d.]+px)\)/)![1]);
    return [origin[0] + tx + s * (x - origin[0]), origin[1] + ty + s * (y + heave - origin[1])];
  }

  it('ends the push with the ship exactly where the fog hold draws it', () => {
    // stern, prow, masthead and keel of the shared drawing
    for (const p of [[396, 800], [1250, 700], [780, 470], [800, 992]] as [number, number][]) {
      const [ax, ay] = ravensEnd(p);
      const [bx, by] = holdStart(p);
      expect(Math.abs(ax - bx), `x of ${p}`).toBeLessThan(1);
      expect(Math.abs(ay - by), `y of ${p}`).toBeLessThan(1);
    }
  });
});
