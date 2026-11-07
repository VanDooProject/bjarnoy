// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import SendingScene from './SendingScene.vue';
describe('SendingScene', () => {
    // The host crossfades beats, so the scene can be in the page twice; shared ids would make one copy's
    // gradients, masks and fog resolve to the other's and vanish when it unmounts.
    it('gives each copy its own ids, and every reference stays inside its own copy', () => {
        const Both = defineComponent({ render: () => h('div', [h(SendingScene), h(SendingScene)]) });
        const w = mount(Both, { attachTo: document.body });
        const svgs = w.findAll('svg');
        expect(svgs).toHaveLength(2);
        const ids = svgs.map((s) => new Set(s.findAll('[id]').map((e) => e.attributes('id'))));
        expect(ids[0].size).toBeGreaterThan(4);
        for (const id of ids[0])
            expect(ids[1].has(id)).toBe(false);
        svgs.forEach((svg, i) => {
            for (const r of svg.html().matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) {
                const target = r[1] ?? r[2];
                if (target === 'intro-fog')
                    continue; // the host's shared texture
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
        expect(bands).toHaveLength(3);
        // the view plus the widest drift tile (1024) and a camera margin
        for (const b of bands)
            expect(Number(b.attributes('width'))).toBeLessThanOrEqual(1600 + 1024 + 80);
    });
    it('pauses with the host', () => {
        expect(mount(SendingScene, { props: { paused: true } }).find('svg').classes()).toContain('is-paused');
        expect(mount(SendingScene).find('svg').classes()).not.toContain('is-paused');
    });
});
