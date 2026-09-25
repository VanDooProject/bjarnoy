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

// Finding #8: the hide-links-on-mobile rule below only makes sense where a
// caller actually gives the player another way to reach them — the mobile
// pull-down drawer (TopBar.vue's `#drawer` slot, MobileHudDrawer.vue).
// Every current caller of HudNav now provides one (see those views' own
// `<template #drawer>`), so this defaults to true; it exists as an explicit
// opt-out rather than an unconditional media query so a future HudNav usage
// with no drawer doesn't silently lose its links on a phone with nothing
// left to reach them from.
//
// Mobile HUD bar rework, phase 2 (owner clarification): the logged-in
// avatar/account-menu leaves the phone bar on every page — Profile/Log out
// move into MobileHudDrawer's own account section instead, unconditionally.
// The anonymous ReturningPlayerMenu trigger is different: it only moves into
// the drawer on a bar that also carries ResourceBar (in-game MapView), where
// there genuinely isn't room for both — everywhere else (docs/tech-tree/
// showcase, the post-founding landing header) it stays inline, just shrunk
// to a single compact line (see ReturningPlayerMenu.vue's own mobile rules)
// so the bar's title still gets room. `hasResourceBar` is a static per-page
// fact the caller already knows (only MapView passes a sibling
// `<ResourceBar>` into this same bar), not something HudNav can infer on its
// own.
withDefaults(defineProps<{ hasDrawer?: boolean; hasResourceBar?: boolean }>(), {
  hasDrawer: true,
  hasResourceBar: false,
});

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
</script>

<template>
  <nav class="hud-nav" :class="{ 'hud-nav--no-drawer': !hasDrawer, 'hud-nav--with-resources': hasResourceBar }">
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
/* Finding #15: this must be declared *before* the `@media` block below, not
   after it — both this and the media query's `.link { display: none }` are
   a single class selector (equal specificity), so whichever is later in the
   stylesheet wins the cascade. Declared afterward (as it used to be), this
   unconditional `inline-flex` always beat the media query's `none` even at
   phone widths, keeping "Reports" visibly inline instead of collapsing into
   the drawer with every other link. */
.reports-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
/* Mobile HUD bar rework: these same destinations are duplicated into the
   pull-down drawer (components/hud/MobileHudDrawer.vue), which is the only
   thing that fits in the compact bar's own width — the inline links here
   would otherwise push ResourceBar's pills off-screen. Keep this in sync
   with lib/breakpoints.ts's HUD_COMPACT_MAX_WIDTH (plain CSS media queries
   can't read a JS constant). Finding #8: scoped to `.hud-nav:not(.hud-nav--no-drawer)`
   so this only ever collapses the links where a drawer actually exists to
   reach them from — see the `hasDrawer` prop's own comment above. */
@media (max-width: 768px) {
  .hud-nav:not(.hud-nav--no-drawer) .link {
    display: none;
  }
}
/* Mobile HUD bar rework, phase 2 (owner clarification): the logged-in
   avatar/account-menu leaves the phone bar everywhere, regardless of
   `hasResourceBar` — see `hasResourceBar`'s own comment above. Profile/Log
   out live in MobileHudDrawer's account section instead. */
@media (max-width: 768px) {
  .hud-nav:not(.hud-nav--no-drawer) .account-menu {
    display: none;
  }
}
/* The anonymous ReturningPlayerMenu trigger only leaves the bar where
   ResourceBar also lives in it — everywhere else it stays inline (shrunk to
   a compact single line, see ReturningPlayerMenu.vue's own mobile rules),
   since there's nothing else contending for that room. Its account-creation
   nudge (ProfileNudge, in its `#nudge` slot) moves along with it into
   MobileHudDrawer's account section in that one case. */
@media (max-width: 768px) {
  .hud-nav--with-resources:not(.hud-nav--no-drawer) .returning-player-menu {
    display: none;
  }
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
  /* Same fix as ReturningPlayerMenu.vue's own identical `.menu` panel — see
     that file's comment. `.hud-bar`'s ambient `pointer-events: none` only
     gets re-enabled for `<button>`s via `.hud-bar-right :deep(button)`, so
     this panel's own background/padding fell through to the canvas
     underneath without this. */
  pointer-events: auto;
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
</style>
