// The one list of HUD navigation destinations (Settlement, Leaderboards, Messages, Reports, Alliance, Docs, Landing) with their
// visibility rules, active-route checks, navigation targets and the Reports
// unread badge. HudNav.vue (desktop top bar) and MobileHudDrawer.vue (phone
// drawer) both render from it, so an entry or a rule added here shows up on
// every surface and can never drift between them.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useReportsStore } from '../stores/reports';
import { modalLocation } from '../lib/modalRoute';
import { showsLandingLink } from './useLandingLink';
import { useMediaQuery } from './useMediaQuery';
import { HUD_NAV_ROOMY_QUERY } from '../lib/breakpoints';
/** Entries that stay inline in the desktop bar; every other visible entry lives in the avatar menu. */
export const HUD_NAV_PRIMARY_IDS = ['settlement'];
/** Entries that also stay inline once the bar is wide enough (`HUD_NAV_ROOMY_QUERY`). */
export const HUD_NAV_ROOMY_PRIMARY_IDS = [...HUD_NAV_PRIMARY_IDS, 'docs'];
export function useHudNavEntries() {
    const route = useRoute();
    const router = useRouter();
    const auth = useAuthStore();
    const player = usePlayerStore();
    const reports = useReportsStore();
    const routeName = () => String(route.name);
    const href = (path) => router.resolve(path).href;
    const entries = computed(() => {
        const all = [
            {
                id: 'settlement',
                labelKey: 'hud.nav.settlement',
                visible: player.hasFoundedSettlement,
                // World mode is the same route with a `#world` hash (MapView.vue), so
                // this stays active there too; the link zooms back to the settlement.
                active: route.name === 'settlement',
                badge: 0,
                href: href('/settlement'),
                go: () => void router.push('/settlement'),
            },
            {
                id: 'leaderboards',
                labelKey: 'hud.nav.leaderboards',
                visible: auth.isAuthenticated,
                active: route.name === 'leaderboards',
                badge: 0,
                href: href('/leaderboards'),
                go: () => void router.push(modalLocation(router, '/leaderboards')),
            },
            {
                id: 'messages',
                labelKey: 'hud.nav.messages',
                visible: auth.isAuthenticated,
                active: ['messages', 'conversation'].includes(routeName()),
                badge: 0,
                href: href('/messages'),
                go: () => void router.push('/messages'),
            },
            {
                id: 'reports',
                labelKey: 'hud.nav.reports',
                visible: true,
                active: routeName().startsWith('report'),
                badge: reports.unreadCount,
                href: href('/reports'),
                go: () => void router.push(modalLocation(router, '/reports')),
            },
            {
                id: 'guild',
                labelKey: 'hud.nav.alliance',
                visible: true,
                active: route.name === 'guild',
                badge: 0,
                href: href('/guild'),
                go: () => void router.push(modalLocation(router, '/guild')),
            },
            {
                id: 'docs',
                labelKey: 'hud.nav.docs',
                visible: true,
                active: ['docs', 'tech-tree', 'tile-docs'].includes(routeName()),
                badge: 0,
                href: href('/docs'),
                go: () => void router.push('/docs'),
            },
            // Only a way back to the pre-founding landing flow: the one rule lives
            // in useLandingLink.ts (hidden on the landing route itself and once a
            // settlement is founded, docs/design/ui-guidelines.md §2).
            {
                id: 'landing',
                labelKey: 'hud.nav.landing',
                visible: showsLandingLink(route.name, player.hasFoundedSettlement),
                active: false,
                badge: 0,
                href: href('/'),
                go: () => void router.push('/'),
            },
        ];
        return all.filter((e) => e.visible).map(({ visible: _visible, ...entry }) => entry);
    });
    const roomy = useMediaQuery(HUD_NAV_ROOMY_QUERY);
    const primaryIds = computed(() => (roomy.value ? HUD_NAV_ROOMY_PRIMARY_IDS : HUD_NAV_PRIMARY_IDS));
    const primary = computed(() => entries.value.filter((e) => primaryIds.value.includes(e.id)));
    const secondary = computed(() => entries.value.filter((e) => !primaryIds.value.includes(e.id)));
    return { entries, primary, secondary };
}
