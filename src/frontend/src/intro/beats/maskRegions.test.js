// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HallScene from './HallScene.vue';
import ProphecyBeat from './ProphecyBeat.vue';
import SendingScene from './SendingScene.vue';
import RavensScene from './RavensScene.vue';
import LongshipScene from './LongshipScene.vue';
// The compositor rasters a mask region whole, on screen or not, and masks with moving content inside redraw it every
// frame. Full-frame regions put a scene over a phone's GPU tile budget, and Chrome then drops whole layers for a few
// frames (the scenery flickered out). Each region stays fitted to what it masks; the high sky fog's (the top 900 units)
// is the largest that needs to be.
const SCENES = [
    ['hall (fire)', HallScene, { beat: 'fire' }],
    ['prophecy', ProphecyBeat, {}],
    ['sending', SendingScene, {}],
    ['ravens', RavensScene, {}],
    ['longship', LongshipScene, {}],
];
describe('intro mask regions', () => {
    it.each(SCENES)('%s: no mask region covers more than 60 percent of the frame', (_, scene, props) => {
        const svg = mount(scene, { props }).find('svg');
        const masks = svg.findAll('mask').filter((m) => m.attributes('maskUnits') === 'userSpaceOnUse');
        expect(masks.length).toBeGreaterThan(0);
        for (const m of masks) {
            const area = Number(m.attributes('width')) * Number(m.attributes('height'));
            expect(area, m.attributes('id')).toBeLessThanOrEqual(0.6 * 1600 * 1600);
        }
    });
});
