import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type Directive,
  type MaybeRefOrGetter,
} from 'vue';
import { useIsMobile } from './useIsMobile';

/**
 * The phone layer stack (docs/design/ui-guidelines.md section 10). On a phone
 * (compact HUD) a layer - modal, drawer, sheet, menu, ring - shows alone over
 * the plain map: every HUD element and every layer beneath it is hidden while
 * it is open and comes back, with its state, when it closes. Layers register
 * themselves here (inside their own component); HUD elements hide through
 * `useHiddenUnderPhoneLayer`; every hide goes through `vPhoneHidden`.
 */
interface LayerEntry {
  token: symbol;
  id?: string;
}

/** Open layers in open order; the last one is the one the player sees. */
const stack = ref<LayerEntry[]>([]);

/** Id of the topmost open layer (only layers that pass an id are named). */
export const topPhoneLayerId = computed(() => stack.value.at(-1)?.id ?? null);

/**
 * Registers the calling component as a layer while `open` is true (default:
 * for as long as it is mounted). Must be called in setup.
 *
 * - `isTop`: open and nothing was opened above it.
 * - `hidden`: on a phone, true while another layer covers it. A closed layer
 *   (e.g. QueueDrawer's always-mounted handle) behaves like HUD and hides
 *   while any layer is open.
 */
export function usePhoneLayer(
  open: MaybeRefOrGetter<boolean> = true,
  id?: string,
): { hidden: ComputedRef<boolean>; isTop: ComputedRef<boolean> } {
  const isMobile = useIsMobile();
  const token = Symbol('phone-layer');

  const remove = () => {
    stack.value = stack.value.filter((entry) => entry.token !== token);
  };
  watch(
    () => toValue(open),
    (on) => {
      if (on) {
        if (!stack.value.some((entry) => entry.token === token)) {
          stack.value = [...stack.value, { token, id }];
        }
      } else {
        remove();
      }
    },
    { immediate: true },
  );
  onScopeDispose(remove);

  const isTop = computed(() => toValue(open) && stack.value.at(-1)?.token === token);
  const hidden = computed(
    () => isMobile.value && (toValue(open) ? !isTop.value : stack.value.length > 0),
  );
  return { hidden, isTop };
}

/** For HUD elements: hidden on a phone while any layer is open. Call in setup. */
export function useHiddenUnderPhoneLayer(): ComputedRef<boolean> {
  const isMobile = useIsMobile();
  return computed(() => isMobile.value && stack.value.length > 0);
}

function apply(el: HTMLElement, hidden: boolean | undefined) {
  // A component root that renders nothing (v-if false) hands the directive a comment node.
  if (!(el instanceof HTMLElement)) return;
  if (hidden) {
    el.style.visibility = 'hidden';
    el.inert = true;
  } else {
    el.style.visibility = '';
    el.inert = false;
  }
}

/**
 * The one way to hide something under a phone layer: invisible and inert,
 * but still laid out and mounted, so measured layout (ResizeObserver) and
 * component state survive while a layer is open. No transition.
 */
export const vPhoneHidden: Directive<HTMLElement, boolean> = {
  mounted: (el, binding) => apply(el, binding.value),
  updated: (el, binding) => apply(el, binding.value),
};

/** Test-only: forget every registered layer. */
export function __resetPhoneLayersForTest(): void {
  stack.value = [];
}
