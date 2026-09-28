<script setup lang="ts">
// The profile (own or someone else's) as a modal over whatever page was
// showing before — see lib/modalRoute.ts and App.vue's own comment on the
// background-route pattern this sits on top of. ProfileView.vue keeps all of
// the actual profile logic (data loading, bio editing, the report dialog,
// and — on the viewer's own profile — the Profile/Settings tabs); this
// component only wires it into ModalShell.vue's shared dialog chrome
// (backdrop, close/back button, desktop/mobile layout).
import { computed, ref } from 'vue';
import ModalShell from '../ModalShell.vue';
import ProfileView from '../../views/ProfileView.vue';

const profileViewRef = ref<InstanceType<typeof ProfileView> | null>(null);

// Mobile's header bar shows the profile's own name once it has loaded —
// exposed by ProfileView rather than fetched again here.
const modalTitle = computed(
  () => profileViewRef.value?.profile?.displayName || profileViewRef.value?.profile?.userName || '',
);
</script>

<template>
  <ModalShell :title="modalTitle" labelledby="profile-modal-name">
    <ProfileView ref="profileViewRef" />
  </ModalShell>
</template>
