// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import RavensScene from './RavensScene.vue';
describe('RavensScene', () => {
    // The host crossfades beats, so the scene can be in the page twice; shared ids would make one copy's
    // gradients, mask and fog resolve to the other's and vanish when it unmounts.
    it('gives each copy its own ids, and every reference stays inside its own copy', () => {
        const Both = defineComponent({ render: () => h('div', [h(RavensScene), h(RavensScene)]) });
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
    it('pauses with the host', () => {
        expect(mount(RavensScene, { props: { paused: true } }).find('svg').classes()).toContain('is-paused');
        expect(mount(RavensScene).find('svg').classes()).not.toContain('is-paused');
    });
});
