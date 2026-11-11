<script setup lang="ts">
// The header's realm switcher: a ▾ button beside the realm name (desktop `.brand`, phone `.settlement-bubble`) that opens the
// list of the player's realms. Only shown with 2+ realms; the one switch path is `world.switchToSettlement`, after which the
// camera centres on the realm that is now run (`focus-home`). One component, used by both places in TopBar.vue.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { routerKey } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{
  /** `bar`: anchored under the desktop brand, 320px wide. `bubble`: full width minus 16px margins under the phone bubble. */
  variant: 'bar' | 'bubble';
}>();
const emit = defineEmits<{ (e: 'focus-home'): void }>();

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const realms = computed(() => world.realmList);
const visible = computed(() => realms.value.length > 1);

const open = ref(false);
const busy = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const popStyle = ref<Record<string, string>>({});

function place() {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const anchor = trigger.closest<HTMLElement>(props.variant === 'bubble' ? '.settlement-bubble' : '.hud-bar') ?? trigger;
  const a = anchor.getBoundingClientRect();
  const below = a.bottom <= window.innerHeight / 2;
  const vertical: Record<string, string> = below ? { top: `${a.bottom + 8}px` } : { bottom: `${window.innerHeight - a.top + 8}px` };
  if (props.variant === 'bubble') {
    popStyle.value = { ...vertical, left: '16px', right: '16px' };
  } else {
    const brand = trigger.closest<HTMLElement>('.brand');
    const left = brand ? brand.getBoundingClientRect().left : a.left;
    popStyle.value = { ...vertical, left: `${Math.max(16, left)}px`, width: '320px', maxWidth: 'calc(100vw - 32px)' };
  }
}

async function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  place();
  open.value = true;
  await nextTick();
}

async function pick(id: string) {
  if (busy.value) return;
  if (id === world.selectedSettlementId) {
    open.value = false;
    return;
  }
  busy.value = true;
  try {
    await world.switchToSettlement(id);
    emit('focus-home');
  } catch {
    // The old realm stays; the list closes either way.
  } finally {
    busy.value = false;
    open.value = false;
  }
}

function onDocPointerDown(e: Event) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false;
}
function onKeydown(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') {
    open.value = false;
    triggerRef.value?.focus();
  }
}
const router = inject(routerKey, null);
const stopRouteWatch = router?.afterEach(() => {
  open.value = false;
});

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onKeydown);
  void world.refreshMyRealms();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onKeydown);
  stopRouteWatch?.();
});
watch(visible, (v) => {
  if (!v) open.value = false;
});
</script>

<template>
  <span v-if="visible" ref="rootRef" class="realm-switcher" :class="`realm-switcher--${variant}`">
    <button
      ref="triggerRef"
      type="button"
      class="realm-switcher-btn"
      :class="{ open }"
      data-testid="realm-switcher-toggle"
      :aria-label="t('hud.realmSwitcher.toggle')"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="toggle"
    />
    <Transition name="realm-pop">
      <div v-if="open" class="realm-switcher-pop" :style="popStyle" data-testid="realm-switcher-list">
        <div class="realm-switcher-heading">{{ t('hud.realmSwitcher.title') }}</div>
        <button
          v-for="r in realms"
          :key="r.id"
          type="button"
          class="realm-row"
          :class="{ current: r.id === world.selectedSettlementId }"
          :data-testid="`realm-row-${r.id}`"
          :aria-current="r.id === world.selectedSettlementId ? 'true' : undefined"
          :disabled="busy"
          @click="pick(r.id)"
        >
          <svg class="realm-hex" viewBox="0 0 100 100" aria-hidden="true">
            <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" />
          </svg>
          <span class="realm-text">
            <span class="realm-name">{{ r.name }}</span>
            <span class="realm-caption">{{ t('hud.realmSwitcher.longhouse', { level: r.level }) }}</span>
          </span>
          <span v-if="r.id === world.selectedSettlementId" class="realm-check" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </span>
</template>

<style scoped>
.realm-switcher {
  display: inline-flex;
  flex: none;
  pointer-events: auto;
}
.realm-switcher-btn {
  appearance: none;
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: rgba(255, 197, 92, 0.08);
  color: var(--gold);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
.realm-switcher-btn::before {
  content: '\25BE';
}
.realm-switcher-btn.open::before {
  content: '\25B4';
}
.realm-switcher-btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.realm-switcher-pop {
  position: fixed;
  z-index: 45;
  box-sizing: border-box;
  padding: 10px;
  border-radius: 12px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  text-align: left;
}
.realm-switcher-heading {
  padding: 4px 8px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.realm-row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.realm-row + .realm-row {
  margin-top: 2px;
}
.realm-row:hover,
.realm-row.current {
  background: rgba(255, 255, 255, 0.06);
}
.realm-row:focus-visible {
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
.realm-row.current .realm-hex {
  fill: var(--gold);
}
.realm-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
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
.realm-check {
  width: 14px;
  height: 8px;
  flex: none;
  margin-right: 4px;
  border-left: 2.5px solid var(--gold);
  border-bottom: 2.5px solid var(--gold);
  transform: translateY(-2px) rotate(-45deg);
}
.realm-pop-enter-active,
.realm-pop-leave-active {
  transition: opacity 0.14s ease, translate 0.14s ease;
}
.realm-pop-enter-from,
.realm-pop-leave-to {
  opacity: 0;
  translate: 0 -6px;
}
</style>
