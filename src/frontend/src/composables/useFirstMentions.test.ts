// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createFirstMentions, provideFirstMentions, useFirstMentions } from './useFirstMentions';

describe('createFirstMentions', () => {
  it('gives the first claim of a type to its owner and refuses every later owner', () => {
    const mentions = createFirstMentions();
    const a = {};
    const b = {};

    expect(mentions.claim('farm', a)).toBe(true);
    expect(mentions.claim('farm', b)).toBe(false);
    expect(mentions.claim('farm', a)).toBe(true);
  });

  it('keeps each type separate', () => {
    const mentions = createFirstMentions();

    expect(mentions.claim('farm', {})).toBe(true);
    expect(mentions.claim('tower', {})).toBe(true);
  });

  it('hands the mention to the next claimant once its owner is released', () => {
    const mentions = createFirstMentions();
    const a = {};
    const b = {};
    mentions.claim('farm', a);
    mentions.release('farm', b); // not the owner: no effect
    expect(mentions.claim('farm', b)).toBe(false);

    mentions.release('farm', a);
    expect(mentions.claim('farm', b)).toBe(true);
  });
});

describe('provideFirstMentions / useFirstMentions', () => {
  it('shares one register with everything below the provider', () => {
    const seen: (boolean | undefined)[] = [];
    const Probe = defineComponent({
      setup() {
        seen.push(useFirstMentions()?.claim('farm', {}));
        return () => null;
      },
    });
    const Page = defineComponent({
      setup() {
        provideFirstMentions();
        return () => [h(Probe), h(Probe)];
      },
    });

    mount(Page);
    expect(seen).toEqual([true, false]);
  });

  it('is null outside a provider', () => {
    let found: unknown = 'unset';
    const Probe = defineComponent({
      setup() {
        found = useFirstMentions();
        return () => null;
      },
    });
    mount(Probe);
    expect(found).toBeNull();
  });
});
