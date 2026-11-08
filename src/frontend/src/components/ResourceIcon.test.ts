// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import ResourceIcon from './ResourceIcon.vue';

const KINDS = ['wood', 'stone', 'food', 'iron', 'pop'] as const;

describe('ResourceIcon', () => {
  it.each(KINDS)('renders a decorative svg with shapes for %s', (kind) => {
    const svg = mount(ResourceIcon, { props: { kind } }).get('svg');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.attributes('width')).toBe('16');
    expect(svg.findAll('path, rect, circle, ellipse').length).toBeGreaterThan(0);
  });

  it('fills each kind with its resource token and honours size', () => {
    for (const kind of KINDS) {
      expect(mount(ResourceIcon, { props: { kind } }).get('svg').attributes('fill')).toBe(`var(--${kind})`);
    }
    expect(mount(ResourceIcon, { props: { kind: 'wood', size: 20 } }).get('svg').attributes('height')).toBe('20');
  });

  it('gives every iron instance its own mask id, referenced by its own path', () => {
    // Two instances in one app, as on a real page (separate mounts are separate apps with restarting ids).
    const Pair = defineComponent({
      components: { ResourceIcon },
      template: '<div><ResourceIcon kind="iron" /><ResourceIcon kind="iron" /></div>',
    });
    const svgs = mount(Pair).findAll('svg');
    const ids = svgs.map((svg) => {
      const id = svg.get('mask').attributes('id')!;
      expect(svg.get('path[mask]').attributes('mask')).toBe(`url(#${id})`);
      return id;
    });
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
