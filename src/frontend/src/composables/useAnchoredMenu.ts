import { inject, nextTick, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue';
import { routerKey } from 'vue-router';
import { usePhoneLayer } from './usePhoneLayer';
import { useIsMobile } from './useIsMobile';

/**
 * The one behaviour of an anchored dropdown that opens from the top bar (SettlementMenu, ReturningPlayerMenu, the account
 * menu in HudNav): a trigger toggles a panel that is teleported to body and positioned `fixed` from an anchor, so hiding the
 * bar under a phone layer cannot hide it. While open it is a phone layer (ui-guidelines section 10). It owns the open state,
 * the placement, outside tap / Escape / arrow keys / route change, and focus. Callers keep their own panel content.
 */

const GAP = 8;
const GUTTER = 16;

export interface AnchoredMenuOptions {
  /** The element that toggles the menu; Escape returns focus to it. */
  trigger: Ref<HTMLElement | null>;
  /** The component root (the trigger lives in it). A pointerdown inside it is not an outside tap. */
  root: Ref<HTMLElement | null>;
  /** The teleported panel. */
  panel: Ref<HTMLElement | null>;
  /** Horizontal style of the panel. Gets the anchor's rect, the trigger and whether this is a phone-sized viewport. */
  horizontal: (anchor: DOMRect, trigger: HTMLElement, isMobile: boolean) => Record<string, string>;
  /** The element the panel hangs from (default: the trigger). */
  anchor?: (trigger: HTMLElement) => HTMLElement;
  /** Gap between the anchor and the panel in px (default 8). */
  gap?: number;
}

export interface AnchoredMenu {
  open: Ref<boolean>;
  /** Pass `layer.hidden.value` to the panel's `v-phone-hidden`. */
  layer: { hidden: ComputedRef<boolean>; isTop: ComputedRef<boolean> };
  /** The panel's `position: fixed` placement. */
  style: Ref<Record<string, string>>;
  /** Which side of the anchor the panel opened on (for decoration such as a notch). */
  side: Ref<'below' | 'above'>;
  /** Phone-sized viewport (the compact HUD). */
  isMobile: Readonly<Ref<boolean>>;
  place: () => void;
  toggle: () => void;
  close: (returnFocus?: boolean) => void;
}

/**
 * Horizontal placement of the bar's dropdowns: on a phone full width between 16px gutters, otherwise `width` wide,
 * right-aligned to the trigger and kept inside the 16px viewport gutter.
 */
export function barMenuHorizontal(width: number): AnchoredMenuOptions['horizontal'] {
  return (_anchor, trigger, isMobile): Record<string, string> => {
    if (isMobile) return { left: `${GUTTER}px`, right: `${GUTTER}px` };
    const w = Math.min(width, window.innerWidth - 2 * GUTTER);
    const rightEdge = trigger.getBoundingClientRect().right;
    const left = Math.min(Math.max(GUTTER, rightEdge - w), window.innerWidth - GUTTER - w);
    return { left: `${left}px`, width: `${w}px` };
  };
}

export function useAnchoredMenu(options: AnchoredMenuOptions): AnchoredMenu {
  const open = ref(false);
  const layer = usePhoneLayer(open);
  const isMobile = useIsMobile();
  const style = ref<Record<string, string>>({});
  const side = ref<'below' | 'above'>('below');

  function place() {
    const trigger = options.trigger.value;
    if (!trigger) return;
    const anchor = options.anchor?.(trigger) ?? trigger;
    const a = anchor.getBoundingClientRect();
    const gap = options.gap ?? GAP;
    const below = a.bottom <= window.innerHeight / 2;
    side.value = below ? 'below' : 'above';
    const vertical: Record<string, string> = below ? { top: `${a.bottom + gap}px` } : { bottom: `${window.innerHeight - a.top + gap}px` };
    style.value = { ...vertical, ...options.horizontal(a, trigger, isMobile.value) };
  }

  function close(returnFocus = false) {
    if (!open.value) return;
    open.value = false;
    if (returnFocus) void nextTick(() => options.trigger.value?.focus());
  }

  function toggle() {
    if (open.value) {
      close();
      return;
    }
    place();
    open.value = true;
  }

  function items(): HTMLElement[] {
    const panel = options.panel.value;
    return panel ? Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = items();
    if (!list.length) return;
    e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % list.length : at <= 0 ? list.length - 1 : at - 1;
    list[next]?.focus();
  }

  function onOutsidePointerDown(e: Event) {
    const target = e.target as Node;
    if (options.root.value?.contains(target) || options.panel.value?.contains(target)) return;
    close();
  }

  function removeListeners() {
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    document.removeEventListener('keydown', onKeydown);
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      document.addEventListener('pointerdown', onOutsidePointerDown, true);
      document.addEventListener('keydown', onKeydown);
      void nextTick(() => items()[0]?.focus({ preventScroll: true }));
    } else {
      removeListeners();
    }
  });

  const router = inject(routerKey, null);
  const stopRouteWatch = router?.afterEach(() => close());
  onScopeDispose(() => {
    removeListeners();
    stopRouteWatch?.();
  });

  return { open, layer, style, side, isMobile, place, toggle, close };
}
