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
  it('holds only the turn into the saga while held: the flames, glow, embers and smoke keep running', () => {
    const rule = hallSource.match(/\.is-held :is\(([^)]*)\) \{ animation-play-state: paused; \}/);
    expect(rule).not.toBeNull();
    const held = rule![1].split(',').map((x) => x.trim());
    expect(held).toEqual(expect.arrayContaining(['.cam', '.far', '.near', '.skald', '.staff', '.gutter', '.dim', '.rimlight', '.dark']));
    for (const ambient of ['.tongue', '.glow', '.ember', '.rim', '.sway', '.rise-a', '.rise-b']) expect(held).not.toContain(ambient);
  });

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

  describe('fire beat: the lit hall, then the camera turns towards the fire', () => {
    // [percent, declarations] of a keyframes rule written as `0% { ... } 8% { ... } 20%, 40% { ... }`
    function stops(name: string): [number, string][] {
      const out: [number, string][] = [];
      for (const m of keyframes(hallSource, name).matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)) {
        for (const at of m[1].split(',')) out.push([parseFloat(at), m[2].trim()]);
      }
      return out;
    }
    /** The keyframes as [ms, value of the property]: a stop's percent of the animation's length. */
    function timeline(name: string, durationMs: number, prop: 'opacity' | 'scale'): [number, number][] {
      return stops(name).map(([pct, decl]) => {
        const m = decl.match(prop === 'opacity' ? /opacity:\s*([\d.]+)/ : /scale\(([\d.]+)\)/);
        return [Math.round((pct / 100) * durationMs), Number(m![1])];
      });
    }
    const ruleOf = (selector: string) => hallSource.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{ ([^}]*) \\}`, 'm'))?.[1] ?? '';
    const mountFire = () => mount(FireBeat, { attachTo: document.body });

    it('has no black start left: no veil, spark or ignite, and the smoke is there from frame 0', () => {
      const w = mountFire();
      for (const gone of ['.veil', '.spark', '.ignite']) expect(w.find(gone).exists(), gone).toBe(false);
      expect(hallSource).not.toMatch(/hall-(veil|spark|ignite|smoke|push|far|near)\b/);
      expect(ruleOf('.smoke')).toBe('opacity: 0.9;');
      w.unmount();
    });

    it('starts as the lit hall at rest: fire and light at 1, no darkness, camera at the identity', () => {
      expect(timeline('hall-open-fire', 3400, 'scale')[0]).toEqual([0, 1]);
      expect(timeline('hall-open-light', 3400, 'opacity')[0]).toEqual([0, 1]);
      expect(timeline('hall-open-rim', 3400, 'opacity')[0]).toEqual([0, 1]);
      expect(timeline('hall-open-dark', 3400, 'opacity')[0]).toEqual([0, 0]);
      for (const layer of ['cam', 'far', 'near', 'skald', 'staff']) expect(keyframes(hallSource, `hall-turn-${layer}`)).toContain('from { transform: none; }');
    });

    it('sinks the fire to 0.12 by 300 ms, to 0.6 by 1700 and back to 1 by 3400, never above 1', () => {
      const fire = timeline('hall-open-fire', 3400, 'scale');
      expect(fire).toEqual([[0, 1], [300, 0.12], [1400, 0.12], [1700, 0.6], [2400, 0.6], [3400, 1]]);
      expect(Math.max(...fire.map(([, v]) => v))).toBe(1);
      expect(ruleOf('.is-fire .gutter')).toContain('hall-open-fire 3400ms ease-out both');
    });

    it('dims the fire light 0.18 by 300 ms, 0.5 by 700, 0.85 by 1700 and 1 by 3400, and the rim lights the same way', () => {
      expect(timeline('hall-open-light', 3400, 'opacity')).toEqual([[0, 1], [300, 0.18], [700, 0.5], [1400, 0.5], [1700, 0.85], [2400, 0.85], [3400, 1]]);
      const rim = timeline('hall-open-rim', 3400, 'opacity');
      expect(rim.map(([t]) => t)).toEqual([0, 300, 700, 1400, 1700, 2400, 3400]);
      // the rim keeps a quarter of its strength at the light's lowest: 0.25 + 0.75 * light
      expect(rim.map(([, v]) => v)).toEqual([1, 0.385, 0.625, 0.625, 0.8875, 0.8875, 1]);
    });

    it('darkens the room to 0.45 by 300 ms (held to 700), 0.1 by 1000, and clears it by 3400', () => {
      expect(timeline('hall-open-dark', 3400, 'opacity')).toEqual([[0, 0], [300, 0.45], [700, 0.45], [1000, 0.1], [3400, 0]]);
    });

    // The host seeks by setting `currentTime` on every CSS animation of the scene, so each one must be a finite,
    // undelayed animation in absolute time that holds its end state (`both`).
    it('runs the transition as finite, undelayed CSS animations in absolute time', () => {
      for (const [selector, ms] of [['.cam', 2600], ['.far', 2600], ['.near', 2600], ['.skald', 2600], ['.staff', 2600], ['.gutter', 3400], ['.dim', 3400], ['.rimlight', 3400], ['.dark', 3400]] as const) {
        const rule = ruleOf(`.is-fire ${selector}`);
        expect(rule, selector).toMatch(new RegExp(`animation: hall-(turn|open)-\\w+ ${ms}ms [^;]* both;`));
        expect(rule, selector).not.toMatch(/infinite|var\(--beat-duration\)/);
      }
      for (const layer of ['cam', 'far', 'near', 'skald', 'staff']) expect(ruleOf(`.is-fire .${layer}`)).toContain('cubic-bezier(0.45, 0, 0.2, 1)');
    });

    it('turns every layer to the same end state the prophecy beat starts from, in landscape and portrait', () => {
      for (const layer of ['cam', 'far', 'near', 'skald', 'staff']) {
        expect(keyframes(hallSource, `hall-turn-${layer}`)).toContain(`to { transform: var(--${layer}-end); }`);
        expect(ruleOf(`.is-prophecy .${layer}`)).toBe(`transform: var(--${layer}-end);`);
      }
      const landscape = hallSource.match(/\.hall \{\n([^}]*)\}/)![1];
      const portrait = hallSource.match(/@media \(max-aspect-ratio: 1\/1\) \{\n  \.hall \{\n([^}]*)\}/)![1];
      const vars = (css: string) => Object.fromEntries([...css.matchAll(/--(\w+)-end: ([^;]+);/g)].map((m) => [m[1], m[2]]));
      expect(vars(landscape)).toEqual({
        cam: 'translateX(150px) scale(1.26)',
        far: 'translateX(170px)',
        near: 'translateX(-420px) scale(1.14)',
        skald: 'translateX(-200px) scale(1.05)',
        staff: 'translateX(-165px) scale(1.04)',
      });
      expect(vars(portrait)).toEqual({
        cam: 'translateX(70px) scale(1.26)',
        far: 'translateX(60px)',
        near: 'translateX(-150px) scale(1.1)',
        skald: 'translateX(-60px) scale(1.03)',
        staff: 'translateX(-50px) scale(1.02)',
      });
    });

    it('keeps the staff behind the bench: staff layer, then skald layer with the bench, both inside the camera', () => {
      const w = mountFire();
      const cam = w.get('.cam').element;
      const staff = cam.querySelector(':scope > .staff')!;
      const skald = cam.querySelector(':scope > .skald')!;
      expect(staff.compareDocumentPosition(skald) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // the bench is the skald layer's first shape, the arm group sits inside it
      expect(skald.firstElementChild!.getAttribute('fill')).toBe('#140b07');
      expect(skald.querySelector(':scope > .arm')).not.toBeNull();
      expect(staff.querySelector('.arm')).toBeNull();
      // between the hearth and the smoke
      const order = [...cam.children];
      expect(order.indexOf(staff)).toBeLessThan(order.indexOf(cam.querySelector('.smoke')!));
      w.unmount();
    });

    it('has no tall near post, only the listeners\' backs', () => {
      const w = mountFire();
      expect(w.get('.near').findAll('rect')).toHaveLength(0);
      expect(w.get('.near').findAll('path')).toHaveLength(2);
      w.unmount();
    });

    it('extends the far layer so a turning camera never shows an edge', () => {
      const w = mountFire();
      const far = w.get('.far');
      const wide = far.findAll('rect').filter((r) => Number(r.attributes('width')) > 1000);
      expect(wide.length).toBeGreaterThanOrEqual(2);
      for (const rect of wide) {
        expect(Number(rect.attributes('x'))).toBeLessThanOrEqual(-400);
        expect(Number(rect.attributes('x')) + Number(rect.attributes('width'))).toBeGreaterThanOrEqual(2000);
      }
      const pillars = far.findAll('path').filter((p) => /^M(-250|1790) 494/.test(p.attributes('d') ?? ''));
      expect(pillars).toHaveLength(2);
      w.unmount();
    });
  });
});
