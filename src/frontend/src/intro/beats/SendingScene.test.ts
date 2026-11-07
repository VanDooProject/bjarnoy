// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import SendingScene, { CAM_MID_END, SHIP_MS, SHIP_ON, SHIP_PLACE, SHIP_TRACK, sendingShipAt } from './SendingScene.vue';
import source from './SendingScene.vue?raw';

describe('SendingScene', () => {
  // The host crossfades beats, so the scene can be in the page twice; shared ids would make one copy's
  // gradients, masks and fog resolve to the other's and vanish when it unmounts.
  it('gives each copy its own ids, and every reference stays inside its own copy', () => {
    const Both = defineComponent({ render: () => h('div', [h(SendingScene), h(SendingScene)]) });
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

  // Every composited layer and mask region is rastered whole, on screen or not. Full-frame masks and fog bands
  // several frames wide put the scene over the GPU tile budget, and Chrome then drops layers for a few frames
  // (the mountains, spear and foreground flickered out).
  it('keeps its mask regions and drifting fog bands to what can be on screen', () => {
    const svg = mount(SendingScene).find('svg');
    const masks = svg.findAll('mask').filter((m) => m.attributes('maskUnits') === 'userSpaceOnUse');
    expect(masks.length).toBeGreaterThan(0);
    for (const m of masks) {
      const area = Number(m.attributes('width')) * Number(m.attributes('height'));
      expect(area, m.attributes('id')).toBeLessThanOrEqual(0.4 * 1600 * 1600);
    }
    const bands = svg.findAll('.sd-fog rect');
    expect(bands).toHaveLength(2);
    // the view plus the widest drift tile (1024) and a camera margin
    for (const b of bands) expect(Number(b.attributes('width'))).toBeLessThanOrEqual(1600 + 1024 + 80);
  });

  it('pauses with the host', () => {
    expect(mount(SendingScene, { props: { paused: true } }).find('svg').classes()).toContain('is-paused');
    expect(mount(SendingScene).find('svg').classes()).not.toContain('is-paused');
  });
});

// The ravens scene starts its ship where the sending leaves it and follows its path through the crossfade (one ship
// across the cut, no double image), using sendingShipAt. That only holds while its constants match the sending's own
// keyframes and template.
describe('sendingShipAt', () => {
  const pair = (s: string) => s.split(/[\s,]+/).filter(Boolean).map((v) => Number(v.replace('px', '')));
  const depart = source.slice(source.indexOf('@keyframes sd-ship-depart'), source.indexOf('\n}', source.indexOf('@keyframes sd-ship-depart')));
  const camMid = source.slice(source.indexOf('@keyframes sd-cam-mid'));
  const camEnd = camMid.match(/100% \{ transform: translate\(([^)]+)\) scale\(([\d.]+)\); \}/)!;

  it('uses the keyframes, ship time, placement and end camera the sending draws with', () => {
    // every keyframe of the run from the departure on, and no other
    const keys = [...depart.matchAll(/\n\s*([\d.%, ]+)\{ transform: translate\(([^)]+)\); \}/g)].map((m) => ({
      at: m[1].split(',').map((v) => Number(v.trim().replace('%', '')) / 100),
      xy: pair(m[2]),
    }));
    const from = keys.flatMap((k) => k.at.map((at) => [at, ...k.xy])).filter(([at]) => at >= SHIP_TRACK[0][0]);
    expect(from.map(([at, x, y]) => [Number(at.toFixed(4)), x, y])).toEqual(SHIP_TRACK.map((k) => [...k]));
    expect(source).toMatch(new RegExp(`--ship-ms: ${SHIP_MS}ms`));
    expect(source).toContain(`translate(${SHIP_PLACE.x},${SHIP_PLACE.y}) scale(${SHIP_PLACE.scale})`);
    expect(pair(camEnd[1])).toEqual([CAM_MID_END.x, CAM_MID_END.y]);
    expect(Number(camEnd[2])).toBe(CAM_MID_END.scale);
  });

  it('places the ship along its run by how long the run has played', () => {
    const at = (ms: number) => sendingShipAt(ms);
    const x = (dx: number) => -32 + 1.04 * (772 + dx);
    expect(at(0).x).toBeCloseTo(x(0), 6); // still moored
    expect(at(0.6286 * 14000).x).toBeCloseTo(x(0), 6);
    expect(at(11200).x).toBeCloseTo(x(90), 6);
    expect(at(14000).x).toBeCloseTo(x(249.6), 6);
    // straight between keyframes: the English sending ends (11 s) while the ship is still speeding up
    const [k0, k1] = [[...SHIP_TRACK].reverse().find((k) => k[0] <= 11000 / 14000)!, SHIP_TRACK.find((k) => k[0] > 11000 / 14000)!];
    expect(at(11000).x).toBeCloseTo(x(k0[1] + ((k1[1] - k0[1]) * (11000 / 14000 - k0[0])) / (k1[0] - k0[0])), 6);
    expect(at(12600).x).toBeCloseTo((at(11200).x + at(14000).x) / 2, 6);
    // after the run it keeps its last speed (SHIP_ON matches the last stretch and the CSS), for SHIP_ON.ms
    const [a, b] = SHIP_TRACK.slice(-2);
    expect(SHIP_ON.x / SHIP_ON.ms).toBeCloseTo((b[1] - a[1]) / ((b[0] - a[0]) * SHIP_MS), 6);
    expect(SHIP_ON.y / SHIP_ON.ms).toBeCloseTo((b[2] - a[2]) / ((b[0] - a[0]) * SHIP_MS), 3);
    expect(source).toContain(`sd-ship-on ${SHIP_ON.ms}ms linear var(--ship-ms)`);
    expect(source).toContain(`to { transform: translate(${SHIP_ON.x}px, ${SHIP_ON.y}px); }`);
    expect(at(15000).x).toBeCloseTo(x(249.6 + SHIP_ON.x / 4), 6);
    expect(at(30000)).toEqual(at(14000 + SHIP_ON.ms));
    expect(at(11800).scale).toBeCloseTo(0.3744, 6);
  });
});
