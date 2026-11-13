<script setup lang="ts">
// The opened army: where it is, its time line with clock times, the food and the orders. One component for both places
// it shows: `inline` opens the selected row of the desktop panel in place, `sheet` is the second level of the phone
// drawer (back button, big countdown, an event list, full-width buttons). What the buttons do is up to the parent.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ArmyRow } from '../../composables/useArmyRows';
import type { TimelineEvent } from '../../lib/units/armyTimeline';
import { formatDurationShort } from '../../lib/units/armyDispatch';
import { unitName } from '../../i18n/catalogueNames';
import type { MessageSchema } from '../../i18n/schema';
import ArmyTimelineBar from './ArmyTimelineBar.vue';
import UnitIcon from '../UnitIcon.vue';

const props = defineProps<{
  row: ArmyRow;
  layout: 'inline' | 'sheet';
  recalling: boolean;
  refusal: string | null;
}>();
const emit = defineEmits<{ back: []; 'show-on-map': []; recall: []; 'field-order': [] }>();

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const timeline = computed(() => props.row.timeline);
const clock = (iso: string) => d(new Date(iso), 'time');

/** The clock times under the bar: where each section begins, and the end of the bar. */
const barTimes = computed(() => {
  const tl = timeline.value;
  if (!tl || tl.startsAt === null) return [];
  return tl.sections.map((s) => ({ key: `${s.kind}-${s.startsAt}`, fraction: s.fraction, text: clock(s.startsAt!) }));
});

const spare = computed(() =>
  timeline.value?.food.spareMs != null ? formatDurationShort(timeline.value.food.spareMs / 1000) : null,
);
const wayHome = computed(() =>
  timeline.value?.food.wayHomeMs != null ? formatDurationShort(timeline.value.food.wayHomeMs / 1000) : null,
);

function eventLabel(event: TimelineEvent): string {
  const hex = { q: event.hex?.q ?? 0, r: event.hex?.r ?? 0 };
  switch (event.kind) {
    case 'left':
      return t('hud.armyDetail.events.left');
    case 'arrived':
      return t(event.past ? 'hud.armyDetail.events.arrived' : 'hud.armyDetail.events.arrives', hex);
    case 'now':
      return t(`hud.armyDetail.now.${nowKey.value}`);
    case 'turnsHome':
      return t(event.past ? 'hud.armyDetail.events.turnedHome' : 'hud.armyDetail.events.turnsHome');
    case 'home':
      return t('hud.armyDetail.events.home');
    case 'starves':
      return t('hud.armyDetail.events.starves');
    case 'movesOn':
      return t('hud.armyDetail.events.movesOn');
    case 'campReady':
      return t('hud.armyDetail.events.campReady');
  }
}

/** The wording of the "now" event for the state the army is in. */
const nowKey = computed(() => {
  switch (timeline.value?.state) {
    case 'standing':
      return 'standing';
    case 'returning':
      return 'returning';
    case 'stranded':
      return 'stranded';
    case 'waiting':
      return 'waiting';
    case 'camp':
      return 'camp';
    default:
      return 'marching';
  }
});
</script>

<template>
  <section class="army-detail" :class="`is-${layout}`" data-testid="army-detail">
    <header v-if="layout === 'sheet'" class="army-detail-header">
      <button type="button" class="army-detail-back" :aria-label="t('hud.armyDetail.back')" data-testid="army-detail-back" @click="emit('back')">
        <svg width="18" height="18" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
          <path d="M7.5 2.5 4 6l3.5 3.5" />
        </svg>
      </button>
      <span class="army-detail-units">
        <span v-for="stack in row.stacks" :key="stack.unit" class="army-detail-unit">
          <UnitIcon :unit="stack.unit" :size="18" />{{ stack.count }} {{ unitName(stack.unit) }}
        </span>
      </span>
      <button type="button" class="army-detail-link" data-testid="army-show-on-map" @click="emit('show-on-map')">
        {{ t('hud.armyDetail.showOnMap') }}
      </button>
    </header>

    <div class="army-detail-body">
      <div v-if="layout === 'sheet'" class="army-detail-status">
        <div class="army-detail-where">{{ row.status }}<span v-if="row.mission" class="mission-tag"> · {{ row.mission }}</span></div>
        <div class="army-detail-countdown" :class="`tone-${row.tone}`">{{ row.eta ?? row.status }}</div>
      </div>
      <div v-else class="army-detail-where">
        {{ row.status }}<span v-if="row.mission" class="mission-tag"> · {{ row.mission }}</span> ·
        <button type="button" class="army-detail-link" data-testid="army-show-on-map" @click="emit('show-on-map')">
          {{ t('hud.armyDetail.showOnMap') }}
        </button>
      </div>

      <div v-if="timeline" class="army-detail-trip">
        <ArmyTimelineBar :timeline="timeline" size="full" :touch="layout === 'sheet'" />
        <ul v-if="layout === 'sheet' && timeline.events.length" class="army-events" data-testid="army-events">
          <li v-for="event in timeline.events" :key="event.kind" class="army-event" :class="{ 'is-past': event.past && event.kind !== 'now', 'is-now': event.kind === 'now' }">
            <span class="army-event-time">{{ event.kind === 'now' ? t('hud.armyDetail.events.now') : clock(event.at) }}</span>
            <span class="army-event-dot" :class="`kind-${event.kind}`" />
            {{ eventLabel(event) }}
          </li>
        </ul>
        <div v-else-if="barTimes.length" class="army-bar-times" data-testid="army-bar-times">
          <span v-for="time in barTimes" :key="time.key" class="army-bar-time" :style="{ flexBasis: `${time.fraction * 100}%` }">{{ time.text }}</span>
          <span v-if="timeline.endsAt" class="army-bar-time is-end">{{ clock(timeline.endsAt) }}</span>
        </div>
      </div>

      <div v-if="timeline" class="army-food">
        <div v-if="layout === 'sheet'" class="army-food-heading">{{ t('hud.armyDetail.foodHeading') }}</div>
        <div class="army-food-grid">
          <div v-if="spare" class="army-food-cell" data-testid="army-food-spare"><i class="swatch kind-spare" />{{ t('hud.armyDetail.spare') }} <b>{{ spare }}</b></div>
          <div v-if="wayHome" class="army-food-cell" data-testid="army-food-way-home"><i class="swatch kind-wayHome" />{{ t('hud.armyDetail.wayHome') }} <b>{{ wayHome }}</b></div>
          <div class="army-food-cell is-muted"><b>{{ Math.floor(timeline.food.provisions) }}</b> {{ t('hud.armyDetail.food') }}</div>
          <div class="army-food-cell is-muted"><b>{{ Math.round(timeline.food.perHour) }}</b> {{ t('hud.armyDetail.perHour') }}</div>
        </div>
      </div>
    </div>

    <p v-if="refusal" class="army-refusal" data-testid="army-recall-refusal">{{ refusal }}</p>
    <div v-if="row.canFieldOrder || row.canRecall" class="army-detail-actions">
      <button
        v-if="row.canFieldOrder"
        type="button"
        class="army-action"
        data-testid="army-field-order"
        :disabled="row.fieldOrderLocked"
        :title="row.fieldOrderLocked ? t('hud.armyPanel.premiumRedirectTitle') : undefined"
        @click="emit('field-order')"
      >
        <span v-if="row.fieldOrderLocked" aria-hidden="true">🔒</span> {{ row.fieldOrderLabel }}
      </button>
      <button v-if="row.canRecall" type="button" class="army-action is-recall" data-testid="army-recall" :disabled="recalling" @click="emit('recall')">
        {{ recalling ? t('hud.armyPanel.recalling') : t('hud.armyPanel.recall') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.army-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--text);
}
.army-detail-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.army-detail.is-inline {
  padding: 0 0 12px;
  gap: 9px;
}
.army-detail-where {
  font-size: 12px;
  color: var(--muted);
}
.mission-tag {
  color: var(--gold);
}
.army-detail-link {
  padding: 0;
  background: transparent;
  border: none;
  color: var(--gold);
  font: inherit;
  cursor: pointer;
}
.army-detail-link:hover {
  color: #ffd88a;
}
.army-detail-trip {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.army-bar-times {
  display: flex;
  font-size: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.army-bar-time {
  /* Each time sits under the start of its section; where the sections are short the times give way to each other. */
  flex-grow: 0;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  padding-right: 8px;
  white-space: nowrap;
}
.army-bar-time.is-end {
  flex: none;
}
.army-food-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  font-size: 12px;
}
.army-food-cell.is-muted {
  color: var(--muted);
}
.army-food-cell b {
  font-weight: 600;
}
.swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 5px;
}
.kind-spare {
  background: var(--food);
}
.kind-wayHome {
  background: var(--army-way-home);
}
.army-detail-actions {
  display: flex;
  gap: 6px;
}
.army-action {
  padding: 5px 10px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.army-action.is-recall {
  color: var(--rival);
  border-color: rgba(226, 112, 95, 0.45);
}
.army-action:disabled {
  opacity: 0.5;
  cursor: default;
}
.army-refusal {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--rival);
}

/* Phone: the second level of the drawer. */
.army-detail.is-sheet {
  flex: 1 1 auto;
}
.army-detail-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 8px 4px;
  border-bottom: 1px solid var(--panel-border);
}
.army-detail-back {
  flex: none;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
}
.army-detail-units {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  font-size: 17px;
  font-weight: 600;
}
.army-detail-unit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.is-sheet .army-detail-link {
  flex: none;
  margin-left: auto;
  white-space: nowrap;
  padding: 12px 8px;
  font-size: 14px;
}
.is-sheet .army-detail-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 16px;
  gap: 16px;
}
.army-detail-status {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.is-sheet .army-detail-where {
  font-size: 13px;
}
.army-detail-countdown {
  font-size: 24px;
  font-weight: 700;
}
.army-detail-countdown::first-letter {
  text-transform: uppercase;
}
.army-detail-countdown.tone-stranded {
  color: var(--army-stranded-text);
}
.army-detail-countdown.tone-support {
  color: var(--army-support-text);
}
.is-sheet .army-detail-trip {
  gap: 8px;
}
.army-events {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
.army-event {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 14px;
}
.army-event.is-past {
  color: var(--muted);
}
.army-event.is-now {
  font-weight: 600;
}
.army-event-time {
  flex: none;
  width: 72px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.army-event.is-now .army-event-time {
  color: var(--gold);
}
.army-event-dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  background: var(--army-way-home);
}
.army-event-dot.kind-left,
.army-event-dot.kind-arrived {
  background: var(--army-march);
}
.army-event-dot.kind-now {
  flex-basis: 2px;
  width: 2px;
  margin: 0 3px;
  background: var(--gold);
}
.army-event-dot.kind-home {
  background: transparent;
  border: 1px solid var(--army-home-text);
}
.army-event-dot.kind-starves {
  background: var(--rival);
}
.army-event-dot.kind-movesOn {
  background: var(--army-waiting);
}
.army-event-dot.kind-campReady {
  background: var(--gold);
}
.army-food {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.army-food-heading {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.is-sheet .army-food-grid {
  gap: 8px 12px;
  font-size: 14px;
}
.is-sheet .army-food-cell.is-muted b {
  font-size: 20px;
}
.is-sheet .army-detail-actions {
  gap: 10px;
  padding: 10px 16px 30px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.is-sheet .army-action {
  flex: 1 1 0;
  min-height: 48px;
  padding: 0 16px;
  font-size: 15px;
}
.is-sheet .army-refusal {
  margin: 0;
  padding: 0 16px 10px;
}
</style>
