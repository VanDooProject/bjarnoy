<script setup lang="ts">
// A location in a report, as a link: back to the map as it was (same mode, same zoom), centred on that hex. Every report
// card shows its locations through this one component, so they all behave the same way.
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { MessageSchema } from '../../i18n/schema';
import { useMapFocus } from '../../composables/useMapFocus';
import { backgroundViewPath, closeModalRoute } from '../../lib/modalRoute';

const props = defineProps<{
  coord: { q: number; r: number };
  /** Text of the link; the coordinate "(q, r)" when omitted. */
  label?: string;
}>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const router = useRouter();
const mapFocus = useMapFocus();

// A report opened over a page without a map (the docs) has no map to go back to, so it goes to the map instead; a request
// must never wait for a later visit.
function showOnMap() {
  mapFocus.request(props.coord);
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
    {{ label ?? t('common.reportLocation.coord', { q: coord.q, r: coord.r }) }}
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
</style>
