<script setup lang="ts">
// A location in a report, as a link: back to the map as it was (same mode, same zoom), centred on that hex. Every report
// card shows its locations through this one component, so they all behave the same way.
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { MessageSchema } from '../../i18n/schema';
import { useMapFocus } from '../../composables/useMapFocus';
import { PIN_DOT, PIN_PATH } from '../../lib/hud/iconPaths';
import { backgroundViewPath, closeModalRoute, isModalRouteName } from '../../lib/modalRoute';

const props = defineProps<{
  coord: { q: number; r: number };
  /** Text of the link; the coordinate "(q, r)" when omitted. */
  label?: string;
  /** A map pin before the label (the compact form in report rows). */
  pin?: boolean;
}>();
const emit = defineEmits<{ navigate: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const router = useRouter();
const mapFocus = useMapFocus();

// A report opened over a page without a map (the docs) has no map to go back to, so it goes to the map instead; a request
// must never wait for a later visit. Outside a report modal (the HUD's Reports panel and sheet sit on the map itself) there
// is no modal to leave: only the focus request, and the caller closes whatever it needs to via `navigate`.
function showOnMap() {
  mapFocus.request(props.coord);
  emit('navigate');
  if (!isModalRouteName(router.currentRoute.value.name)) return;
  const background = backgroundViewPath(router);
  if (background === null || background === '/settlement') closeModalRoute(router);
  else void router.replace('/settlement');
}
</script>

<template>
  <button
    type="button"
    class="report-location-link"
    data-testid="report-location-link"
    :title="t('common.reportLocation.showOnMap')"
    @click="showOnMap"
  >
    <svg
      v-if="pin"
      class="pin"
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path :d="PIN_PATH" />
      <circle :cx="PIN_DOT.cx" :cy="PIN_DOT.cy" :r="PIN_DOT.r" />
    </svg>
    <span>{{ label ?? t('common.reportLocation.coord', { q: coord.q, r: coord.r }) }}</span>
  </button>
</template>

<style scoped>
.report-location-link {
  padding: 0;
  background: none;
  border: 0;
  font: inherit;
  color: var(--gold);
  text-decoration: underline;
  cursor: pointer;
}
/* The pin form is a compact chip (report rows): no underline, pin before the label, a wide enough hit area. */
.report-location-link:has(.pin) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  font-size: 12px;
  text-decoration: none;
  white-space: nowrap;
}
</style>
