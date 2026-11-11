<script setup lang="ts">
// The top bar's settlement menu: a chevron next to the settlement's name that opens "Go to <name>", "Rename…" and, when
// the player owns more than one settlement, the list of their realms. The one menu for both the desktop bar and the phone
// bubble: the parent only says where it hangs (the nearest positioned ancestor, under it) and what rename does.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { api } from '../../api/client';
import { DEMO_MODE } from '../../config';
import { fadePopover } from '../../lib/hud/chipMotion';
import type { SettlementSummary } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{ name: string; /** The phone bubble's chevron: a 44px tap target around the same small glyph. */ touch?: boolean }>();
const emit = defineEmits<{ (e: 'focus-home'): void; (e: 'rename'): void }>();

const world = useWorldStore();
const auth = useAuthStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);

// The realm list is an authorized read: an anonymous or demo player never even asks (it would 401).
const realms = ref<SettlementSummary[]>([]);
const canListRealms = computed(() => !DEMO_MODE && auth.isAuthenticated && !!world.worldId);
const showRealms = computed(() => realms.value.length > 1);

async function loadRealms() {
  if (!canListRealms.value || !world.worldId) return;
  try {
    realms.value = await api.listMySettlements(world.worldId);
  } catch {
    // Best-effort: without the list the menu just has its two entries.
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
  open.value = true;
  void loadRealms();
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
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close();
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    document.removeEventListener('keydown', onKeydown);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown, true);
  document.removeEventListener('keydown', onKeydown);
});

function goHome() {
  close();
  emit('focus-home');
}
function rename() {
  close();
  emit('rename');
}
async function switchTo(id: string) {
  close();
  if (id === world.selectedSettlementId) return;
  await world.switchToSettlement(id);
}

function onEnter(el: Element, done: () => void) {
  void fadePopover(el, 'in').then(done, done);
}
function onLeave(el: Element, done: () => void) {
  void fadePopover(el, 'out').then(done, done);
}

// Opening from the keyboard lands on the first entry.
watch(open, (isOpen) => {
  if (isOpen) void nextTick(() => menuItems()[0]?.focus({ preventScroll: true }));
});
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
    >
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
    </button>
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div v-if="open" ref="menuEl" class="menu" role="menu" :aria-label="t('hud.settlementMenu.toggle')">
        <button type="button" role="menuitem" class="row" @click="goHome">
          {{ t('hud.settlementMenu.goTo', { name: props.name }) }}
        </button>
        <button type="button" role="menuitem" class="row" @click="rename">{{ t('hud.settlementMenu.rename') }}</button>
        <template v-if="showRealms">
          <div class="divider" role="separator" />
          <div class="section-title" role="presentation">{{ t('hud.settlementMenu.realms') }}</div>
          <button
            v-for="realm in realms"
            :key="realm.id"
            type="button"
            role="menuitem"
            class="row realm-row"
            :class="{ current: realm.id === world.selectedSettlementId }"
            :aria-current="realm.id === world.selectedSettlementId ? 'true' : undefined"
            @click="switchTo(realm.id)"
          >
            <span class="realm-name">{{ realm.name }}</span>
            <span v-if="realm.id === world.selectedSettlementId" class="realm-mark">{{ t('hud.settlementMenu.current') }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* The wrapper is layout-neutral: the menu hangs from the parent's positioned box (the name column / the bubble). */
.settlement-menu {
  display: contents;
}
.menu-trigger {
  appearance: none;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}
.menu-trigger:hover,
.menu-trigger.open {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
.menu-trigger:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 1px;
}
.menu-trigger svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 150ms ease;
}
.menu-trigger.open svg {
  transform: rotate(180deg);
}
.menu {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 50;
  min-width: 220px;
  width: max-content;
  max-width: min(320px, calc(100vw - 32px));
  max-height: 70vh;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(10, 20, 27, 0.98);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  transform-origin: top left;
  pointer-events: auto;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  padding: 9px 10px;
  min-height: 36px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
}
.row:hover,
.row:focus-visible {
  background: rgba(255, 255, 255, 0.07);
  outline: none;
}
.divider {
  height: 1px;
  margin: 4px 2px;
  background: var(--panel-border);
}
.section-title {
  padding: 4px 10px 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.realm-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.realm-row.current {
  color: var(--gold);
}
.realm-mark {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
}

/* Phone: the chevron's glyph stays small, its tap target does not (the margins pull the extra size back out of the bubble's layout). */
.menu-trigger.menu-trigger--touch {
  background: transparent;
  width: 44px;
  height: 44px;
  margin: -14px -10px -14px -14px;
}
</style>
