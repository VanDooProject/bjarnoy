<script setup lang="ts">
// Leaderboards as a modal over whatever page was showing before — see lib/modalRoute.ts and App.vue's own comment on
// the background-route pattern. RouteModal.vue owns the dialog chrome (backdrop, size, phone header with its back
// chevron); LeaderboardView.vue owns the rail/list, the board and all data loading. On a phone the back chevron first
// steps from an open board back to the board list, and only from the list closes the modal.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import RouteModal from '../modal/RouteModal.vue';
import LeaderboardView from '../../views/LeaderboardView.vue';
import { useLeaderboardLabels } from '../../composables/useLeaderboardLabels';
import { useLeaderboardStore } from '../../stores/leaderboard';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const { scopeLabel, categoryLabel } = useLeaderboardLabels();
const leaderboard = useLeaderboardStore();

const modal = ref<InstanceType<typeof RouteModal> | null>(null);
const boardOpen = ref(false);

// The phone header names the open board (scope and category: "Score" alone could be the players' or the guilds'); on the list (and on desktop) it names the dialog.
const title = computed(() =>
  boardOpen.value && leaderboard.scope && leaderboard.category
    ? t('leaderboard.boardTitle', { scope: scopeLabel(leaderboard.scope), category: categoryLabel(leaderboard.category) })
    : t('leaderboard.title'),
);

function onBack() {
  if (boardOpen.value) boardOpen.value = false;
  else modal.value?.close();
}
</script>

<template>
  <RouteModal ref="modal" :title="title" size="wide" content-header :on-back="onBack" testid="leaderboard-modal">
    <template #default="{ close }">
      <LeaderboardView v-model:board-open="boardOpen" :close="close" />
    </template>
  </RouteModal>
</template>
