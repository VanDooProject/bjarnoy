// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import SendingScene, { CAM_MID_END, SHIP_MS, SHIP_PLACE, SHIP_TRACK, sendingShipAtEnd } from './SendingScene.vue';
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

// The ravens scene starts its ship where the sending leaves it (one ship across the cut, no double image), using
// sendingShipAtEnd. That only holds while its constants match the sending's own keyframes and template.
describe('sendingShipAtEnd', () => {
  const pair = (s: string) => s.split(/[\s,]+/).filter(Boolean).map((v) => Number(v.replace('px', '')));
  const depart = source.slice(source.indexOf('@keyframes sd-ship-depart'));
  const key = (pct: string) => pair(depart.match(new RegExp(`\\n\\s*${pct}% \\{ transform: translate\\(([^)]+)\\)`))![1]);
  const camMid = source.slice(source.indexOf('@keyframes sd-cam-mid'));
  const camEnd = camMid.match(/100% \{ transform: translate\(([^)]+)\) scale\(([\d.]+)\); \}/)!;

  it('uses the keyframes, ship time, placement and end camera the sending draws with', () => {
    expect(key('80')).toEqual([...SHIP_TRACK.at80]);
    expect(key('100')).toEqual([...SHIP_TRACK.at100]);
    // straight from 80 % on: no keyframe between 80 % and 100 %
    expect(depart.slice(0, depart.indexOf('\n}')).match(/\n\s*(8[1-9]|9\d)(\.\d+)?% /)).toBeNull();
    expect(source).toMatch(new RegExp(`--ship-ms: ${SHIP_MS}ms`));
    expect(source).toContain(`translate(${SHIP_PLACE.x},${SHIP_PLACE.y}) scale(${SHIP_PLACE.scale})`);
    expect(pair(camEnd[1])).toEqual([CAM_MID_END.x, CAM_MID_END.y]);
    expect(Number(camEnd[2])).toBe(CAM_MID_END.scale);
  });

  it('places the ship along its straight run by the length of the beat', () => {
    const at = (ms: number) => sendingShipAtEnd(ms);
    // 11.2 s is 80 % of the run, 14 s its end
    expect(at(11200).x).toBeCloseTo(-32 + 1.04 * (772 + 90), 6);
    expect(at(14000).x).toBeCloseTo(-32 + 1.04 * (772 + 249.6), 6);
    expect(at(12600).x).toBeCloseTo((at(11200).x + at(14000).x) / 2, 6);
    expect(at(20000)).toEqual(at(14000));
    expect(at(11800).scale).toBeCloseTo(0.3744, 6);
  });
});
