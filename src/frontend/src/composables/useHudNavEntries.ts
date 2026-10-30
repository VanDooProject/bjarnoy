// The one list of HUD navigation destinations (Settlement, World map,
// Leaderboards, Messages, Reports, Alliance, Docs, Landing) with their
// visibility rules, active-route checks, navigation targets and the Reports
// unread badge. HudNav.vue (desktop top bar) and MobileHudDrawer.vue (phone
// drawer) both render from it, so an entry or a rule added here shows up on
// every surface and can never drift between them.
import { computed, type ComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useReportsStore } from '../stores/reports';
import { modalLocation } from '../lib/modalRoute';

export type HudNavEntryId =
  | 'settlement'
  | 'world'
  | 'leaderboards'
  | 'messages'
  | 'reports'
  | 'guild'
  | 'docs'
  | 'landing';

export interface HudNavEntry {
  id: HudNavEntryId;
  /** i18n key (global scope) of the entry's label. */
  labelKey: string;
  /** The current route belongs to this entry. */
  active: boolean;
  /** Unread count shown as a badge (Reports only); 0 or absent shows none. */
  badge: number;
  /** Navigates to the entry's destination. */
  go: () => void;
}

/** Entries that stay inline in the desktop bar; every other visible entry lives in the avatar menu. */
export const HUD_NAV_PRIMARY_IDS: readonly HudNavEntryId[] = ['settlement', 'world'];

export function useHudNavEntries(): {
  /** Every entry the player may see right now, in display order. */
  entries: ComputedRef<HudNavEntry[]>;
  /** The visible entries that stay inline in the desktop bar. */
  primary: ComputedRef<HudNavEntry[]>;
  /** The visible entries that live in the avatar menu on desktop. */
  secondary: ComputedRef<HudNavEntry[]>;
} {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const player = usePlayerStore();
  const reports = useReportsStore();

  const routeName = () => String(route.name);

  const entries = computed<HudNavEntry[]>(() => {
    const all: Array<HudNavEntry & { visible: boolean }> = [
      {
        id: 'settlement',
        labelKey: 'hud.nav.settlement',
        visible: player.hasFoundedSettlement,
        active: route.name === 'settlement',
        badge: 0,
        go: () => void router.push('/settlement'),
      },
      // landing-page-defects.md L1: the router guard bounces `/world` back to
      // `/` while `player.hasFoundedSettlement` is false, so the link would be
      // a dead click; an anonymous visitor has no settlement to view either.
      {
        id: 'world',
        labelKey: 'hud.nav.worldMap',
        visible: auth.isAuthenticated && player.hasFoundedSettlement,
        active: route.name === 'world',
        badge: 0,
        go: () => void router.push('/world'),
      },
      {
        id: 'leaderboards',
        labelKey: 'hud.nav.leaderboards',
        visible: auth.isAuthenticated,
        active: route.name === 'leaderboards',
        badge: 0,
        go: () => void router.push(modalLocation(router, '/leaderboards')),
      },
      {
        id: 'messages',
        labelKey: 'hud.nav.messages',
        visible: auth.isAuthenticated,
        active: ['messages', 'conversation'].includes(routeName()),
        badge: 0,
        go: () => void router.push('/messages'),
      },
      {
        id: 'reports',
        labelKey: 'hud.nav.reports',
        visible: true,
        active: routeName().startsWith('report'),
        badge: reports.unreadCount,
        go: () => void router.push(modalLocation(router, '/reports')),
      },
      {
        id: 'guild',
        labelKey: 'hud.nav.alliance',
        visible: true,
        active: route.name === 'guild',
        badge: 0,
        go: () => void router.push(modalLocation(router, '/guild')),
      },
      {
        id: 'docs',
        labelKey: 'hud.nav.docs',
        visible: true,
        active: ['docs', 'tech-tree', 'tile-docs'].includes(routeName()),
        badge: 0,
        go: () => void router.push('/docs'),
      },
      // Only a way back to the pre-founding landing flow: once a settlement is
      // founded the landing page is not a destination any more
      // (docs/design/ui-guidelines.md §2), and on the landing route itself
      // the link would be a self-link.
      {
        id: 'landing',
        labelKey: 'hud.nav.landing',
        visible: !player.hasFoundedSettlement && route.name !== 'landing',
        active: false,
        badge: 0,
        go: () => void router.push('/'),
      },
    ];
    return all.filter((e) => e.visible).map(({ visible: _visible, ...entry }) => entry);
  });

  const primary = computed(() => entries.value.filter((e) => HUD_NAV_PRIMARY_IDS.includes(e.id)));
  const secondary = computed(() => entries.value.filter((e) => !HUD_NAV_PRIMARY_IDS.includes(e.id)));

  return { entries, primary, secondary };
}
