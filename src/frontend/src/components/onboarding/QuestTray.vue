<script setup lang="ts">
// Onboarding quest tray in the settlement view (docs/design/economy.md
// section 7). The landing page's found -> reindeer herder -> lumberjack checklist
// (OnboardingChecklist.vue) hands off to the settlement view; from there
// this tray walks the player through six goals that each pay a resource
// reward on a manual Claim. It shows the first unclaimed quest prominently,
// any *other* completed-but-unclaimed quest as a small claimable row (quests
// can be claimed in any order), and hides itself once all six are claimed.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { apiErrorMessage } from '../../i18n/apiErrors';
import { resourceName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import { rewardOverflows } from '../../lib/quests';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { HUD_COMPACT_QUERY } from '../../lib/breakpoints';
import type { QuestResponse } from '../../api/types';

const { t, te } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const world = useWorldStore();

const REWARD_KINDS = ['wood', 'stone', 'food'] as const;

// A quest id from a newer server that this build has no copy for is left out
// rather than shown as a raw key.
const known = computed(() => world.hud.quests.filter((q) => te(`quests.items.${q.id}.title`)));
const unclaimed = computed(() => known.value.filter((q) => !q.claimed));
const claimedCount = computed(() => known.value.length - unclaimed.value.length);
const current = computed<QuestResponse | undefined>(() => unclaimed.value[0]);
const alsoReady = computed(() => unclaimed.value.slice(1).filter((q) => q.completed));

// Phones: the tray is a round quest button until tapped open — the full card
// covered a third of a landscape screen. The dot says a reward is waiting to
// be claimed (there is always an open quest while the tray exists at all).
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);
const expanded = ref(false);
const collapsed = computed(() => isCompact.value && !expanded.value);
const hasReady = computed(() => unclaimed.value.some((q) => q.completed));

const busyId = ref<string | null>(null);
const error = ref<string | null>(null);

function overflows(q: QuestResponse): boolean {
  return rewardOverflows(q.reward, world.hud.resources, world.hud.storageCap);
}

async function claim(q: QuestResponse) {
  if (busyId.value) return;
  busyId.value = q.id;
  error.value = null;
  try {
    await world.claimQuest(q.id);
  } catch (err) {
    error.value = apiErrorMessage(err, t('quests.claimError'));
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <button
    v-if="current && collapsed"
    type="button"
    class="quest-toggle"
    data-testid="quest-toggle"
    :aria-label="t('quests.open')"
    :title="t('quests.title')"
    @click="expanded = true"
  >
    <svg class="quest-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 17V6a2 2 0 0 0-2-2H5" />
      <path d="M8 20h11a2 2 0 0 0 2-2v-.5a.5.5 0 0 0-.5-.5H10.5a.5.5 0 0 0-.5.5v.5a2 2 0 1 1-4 0V6a2 2 0 1 0-4 0v1.5a.5.5 0 0 0 .5.5H6" />
      <path d="M10 9h5M10 12.5h5" />
    </svg>
    <span v-if="hasReady" class="quest-dot" data-testid="quest-ready-dot" aria-hidden="true" />
  </button>
  <aside v-else-if="current" class="quest-tray" data-testid="quest-tray" :aria-label="t('quests.title')">
    <div class="quest-header">
      <span class="quest-heading">{{ t('quests.title') }}</span>
      <span class="quest-progress" data-testid="quest-progress">
        {{ t('quests.progress', { done: claimedCount, total: known.length }) }}
      </span>
      <button
        v-if="isCompact"
        type="button"
        class="quest-collapse"
        data-testid="quest-collapse"
        :aria-label="t('quests.collapse')"
        @click="expanded = false"
      />
    </div>

    <div class="quest-current" :class="{ 'is-ready': current.completed }" data-testid="quest-current" :data-quest-id="current.id">
      <div class="quest-title">{{ t(`quests.items.${current.id}.title`) }}</div>
      <div class="quest-hint">{{ t(`quests.items.${current.id}.hint`) }}</div>
      <div class="quest-footer">
        <span class="quest-reward" :aria-label="t('quests.rewardLabel')">
          <span v-for="kind in REWARD_KINDS" :key="kind" class="reward-item" :title="resourceName(kind)">
            <span class="hex-icon" :style="{ background: `var(--${kind})` }" />{{ current.reward[kind] }}
          </span>
        </span>
        <button
          v-if="current.completed"
          type="button"
          class="claim-button"
          data-testid="quest-claim"
          :disabled="busyId !== null"
          @click="claim(current)"
        >
          {{ busyId === current.id ? t('quests.claiming') : t('quests.claim') }}
        </button>
      </div>
      <div v-if="current.completed && overflows(current)" class="quest-note" data-testid="quest-overflow-note">
        {{ t('quests.overflowNote') }}
      </div>
    </div>

    <div v-if="alsoReady.length" class="quest-also">
      <div class="quest-also-label">{{ t('quests.alsoReady') }}</div>
      <div v-for="q in alsoReady" :key="q.id" class="quest-row" data-testid="quest-ready-row" :data-quest-id="q.id">
        <div class="quest-row-main">
          <div class="quest-row-title">{{ t(`quests.items.${q.id}.title`) }}</div>
          <span class="quest-reward">
            <span v-for="kind in REWARD_KINDS" :key="kind" class="reward-item" :title="resourceName(kind)">
              <span class="hex-icon" :style="{ background: `var(--${kind})` }" />{{ q.reward[kind] }}
            </span>
          </span>
          <div v-if="overflows(q)" class="quest-note">{{ t('quests.overflowNote') }}</div>
        </div>
        <button type="button" class="claim-button" :disabled="busyId !== null" @click="claim(q)">
          {{ busyId === q.id ? t('quests.claiming') : t('quests.claim') }}
        </button>
      </div>
    </div>

    <div v-if="error" class="quest-error" role="alert" data-testid="quest-error">{{ error }}</div>
  </aside>
</template>

<style scoped>
/* Bottom-left of the settlement view: the queue/expansion cards hang from the
   top-left, the army panel sits bottom-right, and the bottom bar of a
   bottom-docked mobile HUD is cleared through --hud-inset-bottom (MapView). */
.quest-tray {
  position: absolute;
  /* `--hud-inset-left` is the landscape rail's width (0 everywhere else): the
     tray sits right of the ☰ + resource column instead of under it. */
  left: calc(var(--hud-inset-left, 0px) + 16px);
  bottom: calc(16px + var(--hud-inset-bottom, 0px));
  z-index: 10;
  width: 280px;
  max-height: calc(100% - 96px - var(--hud-inset-top, 0px) - var(--hud-inset-bottom, 0px));
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 0;
}
.quest-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
}
.quest-heading {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text);
}
.quest-progress {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.quest-current {
  padding: 9px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.quest-current.is-ready {
  border-color: var(--gold);
  background: rgba(255, 197, 92, 0.1);
}
.quest-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.25;
}
.quest-hint {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--muted);
}
.quest-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.quest-reward {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.reward-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.hex-icon {
  width: 11px;
  height: 11px;
  flex: none;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.claim-button {
  flex: none;
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: var(--gold);
  color: #20160a;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.claim-button:disabled {
  opacity: 0.6;
  cursor: default;
}
.quest-note {
  margin-top: 6px;
  font-size: 11px;
  color: var(--gold);
}
.quest-error {
  margin-top: 8px;
  font-size: 12px;
  color: #e08a8a;
}
.quest-also {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--panel-border);
}
.quest-also-label {
  margin-bottom: 4px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.quest-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
}
.quest-row-main {
  min-width: 0;
}
.quest-row-title {
  font-size: 13px;
  color: var(--text);
}

/* Mobile: a full-width strip along the bottom edge (above a bottom-docked
   HUD bar) instead of a 280px card, and the hint drops to a single line so it
   stays out of the map's way. */
@media (max-width: 768px) {
  .quest-tray {
    left: calc(var(--hud-inset-left, 0px) + 12px);
    right: 12px;
    width: auto;
    bottom: calc(12px + var(--hud-inset-bottom, 0px));
    padding: 8px 12px;
  }
  .quest-header {
    padding-bottom: 5px;
    margin-bottom: 6px;
  }
  .quest-hint {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .quest-footer {
    margin-top: 6px;
  }
}
/* Phones: the collapsed tray, a round quest button in the same corner. */
.quest-toggle {
  position: absolute;
  /* The corner itself, not right of the landscape rail like the open card:
     the rail's column ends well above it. */
  left: calc(12px + env(safe-area-inset-left, 0px));
  /* 20px, not 12: clear of the demo-mode tag in the very corner. */
  bottom: calc(20px + var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
  z-index: 10;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  background: rgba(6, 12, 16, 0.94);
  border: 1px solid var(--panel-border);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}
.quest-icon {
  width: 22px;
  height: 22px;
}
.quest-icon path {
  fill: none;
  stroke: var(--gold);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.quest-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #e5533d;
  box-shadow: 0 0 0 2px rgba(6, 12, 16, 0.94);
}
/* The open card's collapse control: a CSS-drawn chevron (no raw text). */
.quest-collapse {
  align-self: center;
  width: 28px;
  height: 28px;
  margin: -6px -6px -6px 6px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  position: relative;
}
.quest-collapse::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  transform: translate(-50%, -70%) rotate(45deg);
}
</style>
