<script setup lang="ts">
// The top bar's settlement menu: one boxed arrow next to the settlement's name that opens the player's realms (one row each,
// the current one filled) with "Go to" and "Rename" on the current row. Picking another row switches to that realm and
// centres on it. On a hover-capable pointer the other rows show the same two buttons on hover: "Go to" pans without switching,
// "Rename" switches first. The one menu for both the desktop bar and the phone bubble (`touch`); it renders through a teleport
// so no stacking context of the bar or the bubble can put the queue drawer over it.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { routerKey } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { fadePopover } from '../../lib/hud/chipMotion';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{ name: string; /** The phone bubble's arrow: a 24px box with a 44px tap area. */ touch?: boolean }>();
const emit = defineEmits<{
  (e: 'focus-home'): void;
  (e: 'focus-realm', at: { q: number; r: number }): void;
  (e: 'rename'): void;
}>();

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

interface RealmRow {
  id: string;
  name: string;
  level: number;
  q: number | null;
  r: number | null;
}

const open = ref(false);
const busy = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});

/** With 2+ realms the list; otherwise the one realm being run, from what the bar already knows. */
const showList = computed(() => world.realmList.length > 1);
const rows = computed<RealmRow[]>(() =>
  showList.value
    ? world.realmList
    : [{ id: world.selectedSettlementId ?? '', name: props.name, level: world.hud.level, q: null, r: null }],
);
const isCurrent = (id: string) => id === (world.selectedSettlementId ?? '');

function place() {
  const trigger = triggerEl.value;
  if (!trigger) return;
  const phone = !!props.touch;
  const anchor = trigger.closest<HTMLElement>(phone ? '.settlement-bubble' : '.hud-bar') ?? trigger;
  const a = anchor.getBoundingClientRect();
  const vertical: Record<string, string> =
    a.bottom <= window.innerHeight / 2 ? { top: `${a.bottom + 8}px` } : { bottom: `${window.innerHeight - a.top + 8}px` };
  if (phone) {
    menuStyle.value = { ...vertical, left: '16px', right: '16px' };
  } else {
    const brand = trigger.closest<HTMLElement>('.brand');
    const left = brand ? brand.getBoundingClientRect().left : a.left;
    menuStyle.value = { ...vertical, left: `${Math.max(16, left)}px`, width: '320px', maxWidth: 'calc(100vw - 32px)' };
  }
}

function close(returnFocus = false) {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) void nextTick(() => triggerEl.value?.focus());
}

function toggle() {
  if (open.value) {
    close();
    return;
  }
  place();
  open.value = true;
  void world.refreshMyRealms();
}

function menuItems(): HTMLElement[] {
  return menuEl.value ? Array.from(menuEl.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close(true);
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = menuItems();
  if (!items.length) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1);
  items[next]?.focus();
}

function onOutsidePointerDown(e: Event) {
  const target = e.target as Node;
  if (rootEl.value?.contains(target) || menuEl.value?.contains(target)) return;
  close();
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    document.addEventListener('keydown', onKeydown);
    void nextTick(() => menuItems()[0]?.focus({ preventScroll: true }));
  } else {
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    document.removeEventListener('keydown', onKeydown);
  }
});
const router = inject(routerKey, null);
const stopRouteWatch = router?.afterEach(() => close());
onMounted(() => void world.refreshMyRealms());
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true);
  document.removeEventListener('keydown', onKeydown);
  stopRouteWatch?.();
});

/** Another realm's row: switch to it, then centre on it. The current row only closes. */
async function pick(row: RealmRow) {
  if (busy.value) return;
  if (isCurrent(row.id)) {
    close();
    return;
  }
  busy.value = true;
  try {
    await world.switchToSettlement(row.id);
    emit('focus-home');
  } catch {
    // The old realm stays.
  } finally {
    busy.value = false;
    close();
  }
}

function goTo(row: RealmRow) {
  close();
  if (isCurrent(row.id) || row.q === null || row.r === null) emit('focus-home');
  else emit('focus-realm', { q: row.q, r: row.r });
}

async function rename(row: RealmRow) {
  close();
  if (!isCurrent(row.id)) {
    try {
      await world.switchToSettlement(row.id);
    } catch {
      return;
    }
  }
  emit('rename');
}

function onEnter(el: Element, done: () => void) {
  void fadePopover(el, 'in').then(done, done);
}
function onLeave(el: Element, done: () => void) {
  void fadePopover(el, 'out').then(done, done);
}
</script>

<template>
  <div ref="rootEl" class="settlement-menu">
    <button
      ref="triggerEl"
      type="button"
      class="menu-trigger"
      :class="{ open, 'menu-trigger--touch': props.touch }"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="t('hud.settlementMenu.toggle')"
      :title="t('hud.settlementMenu.toggle')"
      @click="toggle"
    />
    <Teleport to="body">
      <Transition :css="false" @enter="onEnter" @leave="onLeave">
        <div
          v-if="open"
          ref="menuEl"
          class="menu"
          :class="{ 'menu--touch': props.touch }"
          role="menu"
          :aria-label="t('hud.settlementMenu.toggle')"
          :style="menuStyle"
        >
          <div v-if="showList" class="section-title" role="presentation">{{ t('hud.settlementMenu.realms') }}</div>
          <div v-for="row in rows" :key="row.id" class="realm-line" :class="{ current: isCurrent(row.id) }">
            <button
              type="button"
              role="menuitem"
              class="realm-pick"
              :aria-current="isCurrent(row.id) ? 'true' : undefined"
              :disabled="busy"
              @click="pick(row)"
            >
              <svg class="realm-hex" viewBox="0 0 100 100" aria-hidden="true">
                <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" />
              </svg>
              <span class="realm-text">
                <span class="realm-name">{{ row.name }}</span>
                <span class="realm-caption">{{ t('hud.settlementMenu.longhouse', { level: row.level }) }}</span>
              </span>
            </button>
            <span class="realm-actions">
              <button
                type="button"
                role="menuitem"
                class="icon-btn"
                data-action="go-to"
                :aria-label="t('hud.settlementMenu.goTo', { name: row.name })"
                :title="t('hud.settlementMenu.goTo', { name: row.name })"
                @click="goTo(row)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="3.2" />
                  <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
                </svg>
              </button>
              <button
                type="button"
                role="menuitem"
                class="icon-btn"
                data-action="rename"
                :aria-label="t('hud.settlementMenu.rename')"
                :title="t('hud.settlementMenu.rename')"
                @click="rename(row)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M10.5 2.5l3 3L5.5 13.5l-3.5.5.5-3.5z" />
                </svg>
              </button>
            </span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* The wrapper is layout-neutral: the menu is teleported and positioned from the arrow's anchor (the bar's brand / the bubble). */
.settlement-menu {
  display: contents;
}
.menu-trigger {
  appearance: none;
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: rgba(255, 197, 92, 0.08);
  color: var(--gold);
  cursor: pointer;
  pointer-events: auto;
  font-size: 12px;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}
.menu-trigger::before {
  content: '\25BE';
}
.menu-trigger.open::before {
  content: '\25B4';
}
.menu-trigger:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
/* Phone: a 24px box inside the bubble, its tap area stays 44px (the pseudo-element reaches past the box). */
.menu-trigger.menu-trigger--touch {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  font-size: 10px;
  /* The box is bigger than the bubble's own content row: the negative margin keeps it out of the bubble's height (the hit area
     below is positioned, not laid out). */
  margin: -4px 0;
}
.menu-trigger.menu-trigger--touch::after {
  content: '';
  position: absolute;
  inset: -10px;
}
.menu {
  position: fixed;
  z-index: 40;
  box-sizing: border-box;
  max-height: 70vh;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  transform-origin: top left;
  pointer-events: auto;
  text-align: left;
}
.section-title {
  padding: 4px 8px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.realm-line {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
}
.realm-line:hover,
.realm-line:focus-within,
.realm-line.current {
  background: rgba(255, 255, 255, 0.06);
}
.realm-pick {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 10px 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.realm-pick:focus-visible,
.icon-btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -2px;
}
.realm-hex {
  width: 22px;
  height: 22px;
  flex: none;
  fill: none;
  stroke: var(--gold);
  stroke-width: 7;
  stroke-linejoin: round;
}
.realm-line.current .realm-hex {
  fill: var(--gold);
}
.realm-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.realm-name {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.realm-caption {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.realm-actions {
  display: flex;
  gap: 6px;
  flex: none;
  padding-right: 6px;
}
.icon-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--gold);
  cursor: pointer;
}
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.icon-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.menu--touch .icon-btn {
  width: 44px;
  height: 44px;
}
/* Other realms: no buttons on touch; with a mouse they show on hover or keyboard focus. */
.realm-line:not(.current) .realm-actions {
  display: none;
}
@media (hover: hover) and (pointer: fine) {
  .realm-line:not(.current) .realm-actions {
    display: flex;
    visibility: hidden;
  }
  .realm-line:not(.current):hover .realm-actions,
  .realm-line:not(.current):focus-within .realm-actions {
    visibility: visible;
  }
}
</style>
