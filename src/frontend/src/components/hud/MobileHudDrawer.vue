<script setup lang="ts">
// Content for the mobile-only pull-down drawer (see TopBar.vue's `drawer`
// slot / composables/useHudDrawer.ts): the nav links HudNav shows on desktop
// but has no room for on mobile. The entries themselves (list, visibility,
// targets, unread badge) come from composables/useHudNavEntries.ts, the same
// source HudNav.vue renders from.
//
// The resource list used to live here too, duplicating ResourceBar's own
// pills still visible in the collapsed bar above — wasted space for the
// same numbers twice. ResourceBar.vue's pills expand in place instead once
// the drawer opens (see its `isExpanded`), so this only needs the links.
//
// Mobile HUD bar rework, phase 2: an account section, mirroring HudNav.vue's
// own account-menu/ReturningPlayerMenu logic rather than importing either
// (same "second, mobile-only surface" reasoning as the nav links above).
// Logged in, Profile/Log out land here unconditionally — the avatar leaves
// every phone bar, not just this one (HudNav.vue's own comment). Anonymous,
// there are no account entries here: ReturningPlayerMenu's own trigger is on
// screen on every phone bar (inline, or as a floating chip on the in-game bar
// — see HudNav.vue) and carries "Name your jarl" / "Log in" / the world list,
// so listing them here too would be the same actions twice. Only the
// account-creation nudge lands here on a `hasResourceBar` bar, where it has
// no room to float.
import { computed, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useLogout } from '../../composables/useLogout';
import { useHudNavEntries, type HudNavEntry } from '../../composables/useHudNavEntries';
import { isHudDrawerPending } from '../../composables/hudDrawerPendingState';
import { profileLocation } from '../../lib/profileRoute';
import type { MessageSchema } from '../../i18n/schema';
import LocaleSwitcher from '../LocaleSwitcher.vue';
import ProfileNudge from '../onboarding/ProfileNudge.vue';

const props = withDefaults(defineProps<{ hasResourceBar?: boolean }>(), { hasResourceBar: false });
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const { logout } = useLogout();
const { entries } = useHudNavEntries();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

function onEntryClick(entry: HudNavEntry) {
  entry.go();
  emit('close');
}

function goToProfile() {
  router.push(profileLocation(router));
  emit('close');
}
async function onLogoutClick() {
  emit('close');
  await logout();
}

// Same gate as HudNav.vue's own `showProfileNudge` — duplicated rather than
// imported for the same "second, mobile-only surface" reason as everything
// else in this file (see its own top-of-file comment).
const unclaimedRealm = computed(
  () =>
    props.hasResourceBar &&
    player.hasFoundedSettlement &&
    player.onboardingComplete &&
    !auth.isAuthenticated &&
    !player.nickname,
);
const showProfileNudge = computed(() => unclaimedRealm.value && !player.profileNudgeDismissed);
// hudDrawerPendingState.ts: TopBar.vue's own grip handle reads this to show
// an attention dot once the nudge has nowhere else left to be seen (only
// true on a `hasResourceBar` bar — see `showProfileNudge` above, which is
// already gated on that).
watch(showProfileNudge, (pending) => { isHudDrawerPending.value = pending; }, { immediate: true });
onBeforeUnmount(() => { isHudDrawerPending.value = false; });
</script>

<template>
  <nav class="drawer-links">
    <button
      v-for="entry in entries"
      :key="entry.id"
      class="link"
      :class="{ active: entry.active }"
      @click="onEntryClick(entry)"
    >
      {{ t(entry.labelKey) }}
      <span v-if="entry.badge > 0" class="badge">{{ entry.badge }}</span>
    </button>
    <!-- The language switcher's only home at phone width — see
         LocaleSwitcher.vue's own comment on why no bar carries it there. -->
    <div class="drawer-locale">
      <LocaleSwitcher in-drawer />
    </div>
    <!-- Account section: Profile/Log out land here unconditionally (the
         avatar leaves every phone bar). Anonymous, only the account-creation
         nudge lands here, on a `hasResourceBar` bar — "Name your jarl",
         "Log in" and the world list are on the floating chip instead (see
         this file's own top-of-file comment). -->
    <div class="drawer-account">
      <template v-if="auth.isAuthenticated">
        <button type="button" class="link" data-testid="drawer-account-profile" @click="goToProfile">
          {{ t('hud.accountMenu.profile') }}
        </button>
        <button type="button" class="link" data-testid="drawer-account-logout" @click="onLogoutClick">
          {{ t('hud.accountMenu.logout') }}
        </button>
      </template>
      <ProfileNudge v-else-if="showProfileNudge" in-drawer />
    </div>
  </nav>
</template>

<style scoped>
.drawer-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.link {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 10px 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: left;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.drawer-locale {
  padding: 10px 4px 4px;
  border-top: 1px solid var(--panel-border);
  margin-top: 4px;
}
.drawer-account {
  display: flex;
  flex-direction: column;
  padding: 10px 4px 4px;
  border-top: 1px solid var(--panel-border);
  margin-top: 4px;
}
.drawer-account:empty {
  display: none;
}
.link.active {
  color: var(--gold);
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: #e08a8a;
  color: #20160a;
  font-size: 10px;
  font-weight: 800;
}
</style>
