// @vitest-environment jsdom
import { defineComponent, effectScope, h, nextTick, ref, withDirectives } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPhoneLayersForTest,
  topPhoneLayerId,
  useHiddenUnderPhoneLayer,
  usePhoneLayer,
  vPhoneHidden,
} from './usePhoneLayer';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as MediaQueryList);
}

let mounted: ReturnType<typeof mount>[] = [];

function mountLayer(open: ReturnType<typeof ref<boolean>>, id?: string) {
  let layer!: ReturnType<typeof usePhoneLayer>;
  const wrapper = mount(
    defineComponent({
      setup() {
        layer = usePhoneLayer(open, id);
        return () => h('div');
      },
    }),
  );
  mounted.push(wrapper);
  return { wrapper, layer };
}

function mountHud() {
  let hidden!: ReturnType<typeof useHiddenUnderPhoneLayer>;
  const wrapper = mount(
    defineComponent({
      setup() {
        hidden = useHiddenUnderPhoneLayer();
        return () => h('div');
      },
    }),
  );
  mounted.push(wrapper);
  return hidden;
}

beforeEach(() => {
  mounted = [];
  __resetPhoneLayersForTest();
  stubMatchMedia(true);
});

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount();
  __resetPhoneLayersForTest();
});

describe('usePhoneLayer', () => {
  it('hides the HUD while a layer is open and shows it again when it closes', async () => {
    const hud = mountHud();
    const open = ref(false);
    mountLayer(open);
    expect(hud.value).toBe(false);

    open.value = true;
    await nextTick();
    expect(hud.value).toBe(true);

    open.value = false;
    await nextTick();
    expect(hud.value).toBe(false);
  });

  it('shows only the topmost of nested layers and brings the lower one back on close', async () => {
    const aOpen = ref(true);
    const bOpen = ref(false);
    const a = mountLayer(aOpen, 'a').layer;
    const b = mountLayer(bOpen, 'b').layer;
    expect(a.hidden.value).toBe(false);
    expect(a.isTop.value).toBe(true);

    bOpen.value = true;
    await nextTick();
    expect(a.hidden.value).toBe(true);
    expect(a.isTop.value).toBe(false);
    expect(b.hidden.value).toBe(false);
    expect(b.isTop.value).toBe(true);
    expect(topPhoneLayerId.value).toBe('b');

    bOpen.value = false;
    await nextTick();
    expect(a.hidden.value).toBe(false);
    expect(a.isTop.value).toBe(true);
    expect(topPhoneLayerId.value).toBe('a');
  });

  it('puts a reopened layer on top of the ones opened meanwhile', async () => {
    const aOpen = ref(true);
    const bOpen = ref(true);
    const a = mountLayer(aOpen, 'a').layer;
    const b = mountLayer(bOpen, 'b').layer;
    expect(b.isTop.value).toBe(true);

    aOpen.value = false;
    await nextTick();
    aOpen.value = true;
    await nextTick();
    expect(a.isTop.value).toBe(true);
    expect(b.hidden.value).toBe(true);
  });

  it('removes a layer from the stack when its component unmounts', async () => {
    const hud = mountHud();
    const { wrapper } = mountLayer(ref(true), 'gone');
    expect(hud.value).toBe(true);
    expect(topPhoneLayerId.value).toBe('gone');

    wrapper.unmount();
    await nextTick();
    expect(hud.value).toBe(false);
    expect(topPhoneLayerId.value).toBeNull();
  });

  it('removes the entry when its effect scope is disposed', () => {
    const scope = effectScope();
    scope.run(() => {
      usePhoneLayer(true, 'scoped');
    });
    expect(topPhoneLayerId.value).toBe('scoped');
    scope.stop();
    expect(topPhoneLayerId.value).toBeNull();
  });

  it('registers for as long as it is mounted when no open flag is given', () => {
    let layer!: ReturnType<typeof usePhoneLayer>;
    const wrapper = mount(
      defineComponent({
        setup() {
          layer = usePhoneLayer();
          return () => h('div');
        },
      }),
    );
    mounted.push(wrapper);
    expect(layer.isTop.value).toBe(true);
  });

  it('hides a closed layer (always-mounted chrome) while another layer is open', async () => {
    const drawerOpen = ref(false);
    const otherOpen = ref(false);
    const drawer = mountLayer(drawerOpen).layer;
    mountLayer(otherOpen);
    expect(drawer.hidden.value).toBe(false);

    otherOpen.value = true;
    await nextTick();
    expect(drawer.hidden.value).toBe(true);

    otherOpen.value = false;
    await nextTick();
    expect(drawer.hidden.value).toBe(false);
  });

  it('never hides anything on desktop', async () => {
    stubMatchMedia(false);
    const hud = mountHud();
    const aOpen = ref(true);
    const bOpen = ref(true);
    const a = mountLayer(aOpen).layer;
    mountLayer(bOpen);
    await nextTick();
    expect(hud.value).toBe(false);
    expect(a.hidden.value).toBe(false);
  });
});

describe('vPhoneHidden', () => {
  function mountWith(hidden: ReturnType<typeof ref<boolean>>) {
    const wrapper = mount(
      defineComponent({
        setup() {
          return () => withDirectives(h('div', { class: 'target' }), [[vPhoneHidden, hidden.value]]);
        },
      }),
    );
    mounted.push(wrapper);
    return wrapper.element as HTMLElement;
  }

  it('sets and clears visibility and inert', async () => {
    const hidden = ref(true);
    const el = mountWith(hidden);
    expect(el.style.visibility).toBe('hidden');
    expect(el.inert).toBe(true);

    hidden.value = false;
    await nextTick();
    expect(el.style.visibility).toBe('');
    expect(el.inert).toBe(false);

    hidden.value = true;
    await nextTick();
    expect(el.style.visibility).toBe('hidden');
    expect(el.inert).toBe(true);
  });
});
