<script setup lang="ts">
// Issue #16 "header": "nav links WORLD MAP / REPORTS / ALLIANCE, and a
// round avatar badge" — Alliance now links to GuildView (the guild/alliance
// system) and Reports to ReportsView (issue #41's moderation-report inbox),
// both real features now. The avatar carries the player's nickname initials
// (or the game's own initials as a fallback), replacing the plain nickname
// pill TopBar used to show.
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useReportsStore } from '../../stores/reports';
import { useLogout } from '../../composables/useLogout';
import { DEMO_MODE } from '../../config';
import LocaleSwitcher from '../LocaleSwitcher.vue';
import ProfileNudge from '../onboarding/ProfileNudge.vue';
import ReturningPlayerMenu from './ReturningPlayerMenu.vue';
import type { MessageSchema } from '../../i18n/schema';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const reports = useReportsStore();
const { logout } = useLogout();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// Issue #40 phase 3: a lightweight "new reports" badge. HudNav is mounted
// for as long as TopBar is (settlement/world map views), so its own
// mount/unmount is a reasonable lifetime for the reports store's poll —
// see stores/reports.ts's own comment on why this isn't folded into
// stores/world.ts's poll loop.
function syncPolling() {
  if (!DEMO_MODE && player.settlementId) {
    reports.startPolling(player.settlementId, player.id);
  } else {
    reports.stopPolling();
  }
}
onMounted(syncPolling);
onUnmounted(() => reports.stopPolling());
watch(() => player.settlementId, syncPolling);

const initials = computed(() => {
  if (!player.nickname) return 'BJ';
  const parts = player.nickname.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
});

// Design handoff "2a" frame 5: the profile-mark nudge that replaces the old
// forced end-of-flow nickname modal — shown once onboarding is actually
// done (player.onboardingComplete, set the moment guidance.complete fires
// in LandingView.vue, not just while the completion banner happens to be on
// screen), for as long as the player stays anonymous and hasn't dismissed
// it. HudNav is mounted on both the landing page and the settlement view,
// so this follows the player there too until they act on it.
const showProfileNudge = computed(
  () =>
    player.hasFoundedSettlement &&
    player.onboardingComplete &&
    !auth.isAuthenticated &&
    !player.nickname &&
    !player.profileNudgeDismissed,
);

// Player logout/login gate: the authenticated avatar is now a small account
// dropdown (Profile / Log out) rather than a direct link to /profile,
// mirroring ReturningPlayerMenu's own trigger/panel open-close pattern
// (click to open, closes on outside click or Escape) since this is the same
// kind of small anchored panel.
const accountMenuOpen = ref(false);
const accountMenuRoot = ref<HTMLDivElement | null>(null);

function toggleAccountMenu() {
  accountMenuOpen.value = !accountMenuOpen.value;
}
function closeAccountMenu() {
  accountMenuOpen.value = false;
}
function goToProfile() {
  closeAccountMenu();
  router.push('/profile');
}
async function onLogoutClick() {
  closeAccountMenu();
  await logout();
}
function onAccountMenuPointerDown(event: PointerEvent) {
  if (!accountMenuOpen.value) return;
  const target = event.target as Node | null;
  if (accountMenuRoot.value && target && !accountMenuRoot.value.contains(target)) closeAccountMenu();
}
function onAccountMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAccountMenu();
}
onMounted(() => {
  document.addEventListener('pointerdown', onAccountMenuPointerDown, true);
  document.addEventListener('keydown', onAccountMenuKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onAccountMenuPointerDown, true);
  document.removeEventListener('keydown', onAccountMenuKeydown);
});
// A navigation while the menu is open should close it, same as
// ReturningPlayerMenu does for its own panel.
watch(() => route.fullPath, closeAccountMenu);

// Mobile audit: `.hud-nav` is `flex: none` inside TopBar's fixed 64px row, so
// every link renders off-screen to the left on a 390px viewport. Below the
// breakpoint the links move into a collapsible dropdown behind a hamburger
// toggle instead — same buttons, same DOM order, just hidden until opened
// (see HudNav.test.ts / e2e's `.hud-nav button` queries, which keep working
// unchanged since nothing is removed, only wrapped).
const menuOpen = ref(false);
const navLinksRoot = ref<HTMLDivElement | null>(null);

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}
function closeMenu() {
  menuOpen.value = false;
}
function onMenuPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return;
  const target = event.target as Node | null;
  if (navLinksRoot.value && target && !navLinksRoot.value.contains(target)) closeMenu();
}
function onMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu();
}
onMounted(() => {
  document.addEventListener('pointerdown', onMenuPointerDown, true);
  document.addEventListener('keydown', onMenuKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onMenuPointerDown, true);
  document.removeEventListener('keydown', onMenuKeydown);
});
watch(() => route.fullPath, closeMenu);
</script>

<template>
  <nav class="hud-nav">
    <button
      type="button"
      class="menu-toggle"
      data-testid="hud-nav-menu-toggle"
      :aria-expanded="menuOpen"
      aria-controls="hud-nav-links"
      :aria-label="t('hud.nav.menu')"
      @click="toggleMenu"
    >
      <span class="menu-toggle-bar" aria-hidden="true" />
      <span class="menu-toggle-bar" aria-hidden="true" />
      <span class="menu-toggle-bar" aria-hidden="true" />
    </button>
    <div
      ref="navLinksRoot"
      class="nav-links"
      :class="{ open: menuOpen }"
      id="hud-nav-links"
      data-testid="hud-nav-links"
      @click="closeMenu"
    >
    <button
      v-if="player.hasFoundedSettlement"
      class="link"
      :class="{ active: route.name === 'settlement' }"
      @click="router.push('/settlement')"
    >
      {{ t('hud.nav.settlement') }}
    </button>
    <!-- landing-page-defects.md L1: the router guard (router/index.ts) bounces
         `/world` straight back to `/` while `player.hasFoundedSettlement` is
         false, so this link is a dead click on every pre-founding route this
         nav gets mounted on (the landing page's post-founding half included,
         for the brief window before founding flips it true) — hide it rather
         than offer a click that silently does nothing. Layered onto that:
         an anonymous visitor has no settlement of their own to view here
         either (returning-player nav work), so the auth check on top of the
         existing founded-settlement one keeps this hidden for them too. -->
    <button
      v-if="auth.isAuthenticated && player.hasFoundedSettlement"
      class="link"
      :class="{ active: route.name === 'world' }"
      @click="router.push('/world')"
    >
      {{ t('hud.nav.worldMap') }}
    </button>
    <button
      v-if="auth.isAuthenticated"
      class="link"
      :class="{ active: route.name === 'leaderboards' }"
      @click="router.push('/leaderboards')"
    >
      {{ t('hud.nav.leaderboards') }}
    </button>
    <button
      v-if="auth.isAuthenticated"
      class="link"
      :class="{ active: ['messages', 'conversation'].includes(String(route.name)) }"
      @click="router.push('/messages')"
    >
      {{ t('hud.nav.messages') }}
    </button>
    <button
      class="link reports-link"
      :class="{ active: String(route.name).startsWith('report') }"
      @click="router.push('/reports')"
    >
      {{ t('hud.nav.reports') }}
      <span v-if="reports.unreadCount > 0" class="badge">{{ reports.unreadCount }}</span>
    </button>
    <button class="link" :class="{ active: route.name === 'guild' }" @click="router.push('/guild')">
      {{ t('hud.nav.alliance') }}
    </button>
    <button
      class="link"
      :class="{ active: ['docs', 'tech-tree', 'tile-docs'].includes(String(route.name)) }"
      @click="router.push('/docs')"
    >
      {{ t('hud.nav.docs') }}
    </button>
    <!-- landing-page-defects.md L1: a self-link on the page you're already
         on when route.name is 'landing' — HudNav is mounted there too, for
         the post-founding half of LandingView (see that component's own
         header split). Hide it there rather than offer a click to nowhere. -->
    <button v-if="route.name !== 'landing'" class="link" @click="router.push('/')">
      {{ t('hud.nav.landing') }}
    </button>
    <LocaleSwitcher />
    </div>
    <!-- Logged in, the avatar opens a small account dropdown — Profile
         (issue #42) or Log out (player logout/login gate: `useLogout`
         clears the local identity and drops back to a full page reload).
         Anonymous, ReturningPlayerMenu offers logging in or joining another
         world instead — registration (issue #108) is still reachable from
         there via the account-creation nudge (ProfileNudge, in its `nudge`
         slot) once onboarding is done. -->
    <div v-if="auth.isAuthenticated" ref="accountMenuRoot" class="account-menu">
      <button
        type="button"
        class="avatar avatar-button"
        aria-haspopup="menu"
        :aria-expanded="accountMenuOpen"
        :title="t('hud.nav.profileTitle')"
        data-testid="account-menu-trigger"
        @click="toggleAccountMenu"
      >
        {{ initials }}
      </button>
      <div v-if="accountMenuOpen" class="panel menu account-panel" role="menu" data-testid="account-menu">
        <div class="notch" />
        <button type="button" role="menuitem" class="row" data-testid="account-menu-profile" @click="goToProfile">
          {{ t('hud.accountMenu.profile') }}
        </button>
        <button type="button" role="menuitem" class="row" data-testid="account-menu-logout" @click="onLogoutClick">
          {{ t('hud.accountMenu.logout') }}
        </button>
      </div>
    </div>
    <ReturningPlayerMenu v-else :nudging="showProfileNudge">
      <template #nudge>
        <ProfileNudge v-if="showProfileNudge" />
      </template>
    </ReturningPlayerMenu>
  </nav>
</template>

<style scoped>
.hud-nav {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: none;
  padding-left: 22px;
  border-left: 1px solid var(--panel-border);
}
/* Desktop: the toggle never shows, and the links wrapper contributes nothing
   of its own — its children lay out as direct flex items of `.hud-nav`,
   exactly as before this wrapper existed. */
.menu-toggle {
  display: none;
}
.nav-links {
  display: contents;
}
.link {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-family: inherit;
}
.link:hover {
  color: var(--text);
}
.link.active {
  color: var(--gold);
}
.link.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.reports-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
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
  letter-spacing: 0;
  text-transform: none;
}
.avatar-button {
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
.avatar {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gold);
  color: #20160a;
  font-size: 12px;
  font-weight: 700;
}
/* Same anchored-panel shape as ReturningPlayerMenu.vue's `.menu`/`.notch` —
   deliberately not shared as a component, just the same small pattern
   applied to a second, unrelated trigger. */
.account-menu {
  position: relative;
  display: flex;
  flex: none;
}
.account-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 50;
  width: 160px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.notch {
  position: absolute;
  right: 7px;
  top: -7px;
  width: 14px;
  height: 14px;
  background: var(--panel-bg);
  border-left: 1px solid var(--panel-border);
  border-top: 1px solid var(--panel-border);
  transform: rotate(45deg);
}
.row {
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
}
.row:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--gold);
}

/* Mobile audit (390px iPhone 13): every `.link` here used to render at
   x≈-200..16 — off-screen and unreachable — because `.hud-nav` is `flex:
   none` fighting the brand block for a fixed-height row. Collapse the links
   (+ LocaleSwitcher) behind a hamburger toggle into an anchored dropdown
   instead, same shape as `.account-panel`/ReturningPlayerMenu's `.menu`
   above. The avatar/ReturningPlayerMenu trigger stay in the bar itself —
   only `.nav-links` moves into the panel. */
@media (max-width: 768px) {
  .hud-nav {
    /* No longer its own flex row: the toggle/panel position against
       `.hud-bar` (already a containing block — see TopBar.vue), not against
       this now-inline element. */
    position: static;
    gap: 8px;
    padding-left: 0;
    border-left: none;
  }
  .menu-toggle {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 44px;
    height: 44px;
    flex: none;
    background: transparent;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    cursor: pointer;
    padding: 0;
  }
  .menu-toggle-bar {
    display: block;
    width: 18px;
    height: 2px;
    background: var(--text);
    border-radius: 1px;
  }
  .nav-links {
    display: none;
  }
  .nav-links.open {
    display: flex;
    position: absolute;
    top: calc(100% + 6px);
    right: 8px;
    min-width: 200px;
    max-width: calc(100vw - 16px);
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: 8px;
    /* The existing panel look (see `.account-panel` above), but opaque:
       --panel-bg's slight translucency lets the onboarding banner/pointer
       underneath read through the menu rows. */
    background: #0a141b;
    border: 1px solid var(--panel-border);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
    z-index: 50;
  }
  .nav-links.open .link {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    font-size: 14px;
    text-align: left;
  }
  .nav-links.open :deep(.locale-switcher) {
    align-self: flex-start;
  }
  .avatar {
    width: 36px;
    height: 36px;
  }
}
</style>
