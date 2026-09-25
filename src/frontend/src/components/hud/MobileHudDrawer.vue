<script setup lang="ts">
// Content for the mobile-only pull-down drawer (see TopBar.vue's `drawer`
// slot / composables/useHudDrawer.ts): the nav links HudNav shows inline on
// desktop but has no room for on mobile. Mirrors HudNav.vue's own link
// list/visibility rules rather than importing HudNav itself — HudNav is
// desktop chrome living inside the collapsed bar (out of scope to
// restructure here), this is a second, mobile-only surface for the same
// destinations.
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
// the login/world-list entry points only land here on a `hasResourceBar` bar
// (in-game MapView): everywhere else ReturningPlayerMenu's own trigger stays
// inline in the bar instead (see HudNav.vue's `hasResourceBar` comment), so
// duplicating it here too would just be the same thing twice.
import { computed, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useReportsStore } from '../../stores/reports';
import { useWorldStore } from '../../stores/world';
import { useLogout } from '../../composables/useLogout';
import { isHudDrawerPending } from '../../composables/hudDrawerPendingState';
import type { MessageSchema } from '../../i18n/schema';
import LocaleSwitcher from '../LocaleSwitcher.vue';
import ProfileNudge from '../onboarding/ProfileNudge.vue';

const props = withDefaults(defineProps<{ hasResourceBar?: boolean }>(), { hasResourceBar: false });
const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const reports = useReportsStore();
const world = useWorldStore();
const { logout } = useLogout();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

function go(path: string) {
  router.push(path);
  emit('close');
}

function goToProfile() {
  go('/profile');
}
async function onLogoutClick() {
  emit('close');
  await logout();
}

// Same login-target linkage as ReturningPlayerMenu.vue's own `loginTarget` —
// see that file's comment.
const loginTarget = computed<RouteLocationRaw>(() => {
  if (!world.worldId) return '/login';
  const query: Record<string, string> = { worldId: world.worldId };
  if (world.worldName) query.worldName = world.worldName;
  return { path: '/login', query };
});
function goToLogin() {
  router.push(loginTarget.value);
  emit('close');
}

// Same gate as HudNav.vue's own `showProfileNudge` — duplicated rather than
// imported for the same "second, mobile-only surface" reason as everything
// else in this file (see its own top-of-file comment).
const showProfileNudge = computed(
  () =>
    props.hasResourceBar &&
    player.hasFoundedSettlement &&
    player.onboardingComplete &&
    !auth.isAuthenticated &&
    !player.nickname &&
    !player.profileNudgeDismissed,
);
// hudDrawerPendingState.ts: TopBar.vue's own grip handle reads this to show
// an attention dot once the nudge has nowhere else left to be seen (only
// true on a `hasResourceBar` bar — see `showProfileNudge` above, which is
// already gated on that).
watch(showProfileNudge, (pending) => { isHudDrawerPending.value = pending; }, { immediate: true });
onBeforeUnmount(() => { isHudDrawerPending.value = false; });
</script>

<template>
  <nav class="drawer-links">
    <button v-if="player.hasFoundedSettlement" class="link" :class="{ active: route.name === 'settlement' }" @click="go('/settlement')">
      {{ t('hud.nav.settlement') }}
    </button>
    <button
      v-if="auth.isAuthenticated && player.hasFoundedSettlement"
      class="link"
      :class="{ active: route.name === 'world' }"
      @click="go('/world')"
    >
      {{ t('hud.nav.worldMap') }}
    </button>
    <button v-if="auth.isAuthenticated" class="link" :class="{ active: route.name === 'leaderboards' }" @click="go('/leaderboards')">
      {{ t('hud.nav.leaderboards') }}
    </button>
    <button
      v-if="auth.isAuthenticated"
      class="link"
      :class="{ active: ['messages', 'conversation'].includes(String(route.name)) }"
      @click="go('/messages')"
    >
      {{ t('hud.nav.messages') }}
    </button>
    <button class="link" :class="{ active: String(route.name).startsWith('report') }" @click="go('/reports')">
      {{ t('hud.nav.reports') }}
      <span v-if="reports.unreadCount > 0" class="badge">{{ reports.unreadCount }}</span>
    </button>
    <button class="link" :class="{ active: route.name === 'guild' }" @click="go('/guild')">
      {{ t('hud.nav.alliance') }}
    </button>
    <button class="link" :class="{ active: ['docs', 'tech-tree', 'tile-docs'].includes(String(route.name)) }" @click="go('/docs')">
      {{ t('hud.nav.docs') }}
    </button>
    <!-- Mirrors HudNav.vue's own landing self-link rule: hidden on the
         landing route itself rather than offering a click to nowhere
         (finding #8 — this drawer is now shared by every page that shows
         HudNav, docs pages included, which previously had no way back
         "home" at all on a phone). -->
    <button v-if="route.name !== 'landing'" class="link" @click="go('/')">
      {{ t('hud.nav.landing') }}
    </button>
    <!-- The language switcher's only home at phone width — see
         LocaleSwitcher.vue's own comment on why no bar carries it there. -->
    <div class="drawer-locale">
      <LocaleSwitcher in-drawer />
    </div>
    <!-- Account section: Profile/Log out land here unconditionally (the
         avatar leaves every phone bar); the anonymous login/world-list entry
         points only land here on a `hasResourceBar` bar, where
         ReturningPlayerMenu's own trigger is hidden instead of staying
         inline — see this file's own top-of-file comment. -->
    <div class="drawer-account">
      <template v-if="auth.isAuthenticated">
        <button type="button" class="link" data-testid="drawer-account-profile" @click="goToProfile">
          {{ t('hud.accountMenu.profile') }}
        </button>
        <button type="button" class="link" data-testid="drawer-account-logout" @click="onLogoutClick">
          {{ t('hud.accountMenu.logout') }}
        </button>
      </template>
      <template v-else-if="hasResourceBar">
        <button type="button" class="link" data-testid="drawer-account-login" @click="goToLogin">
          {{ t('hud.returningPlayer.logIn') }}
        </button>
        <button type="button" class="link" data-testid="drawer-account-worlds" @click="go('/worlds')">
          {{ t('worlds.title') }}
        </button>
        <ProfileNudge v-if="showProfileNudge" in-drawer />
      </template>
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
