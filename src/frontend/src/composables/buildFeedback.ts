// Hand-off between MapView (which knows when a build was confirmed, and where
// its dial is on screen) and the queue UIs that answer it: BuildQueuePanel's
// token flight + row slide-in on desktop, QueueDrawer's peek on phones.
//
// Module-level state in the style of hudDrawerOpenState.ts: there is only ever
// one map view, and the two consumers are mutually exclusive (desktop panel vs
// phone drawer), so each simply reacts to the event if it is mounted.
import { ref, shallowRef } from 'vue';

export interface ConfirmedBuild {
  /** Increments per event, so two builds in a row both fire watchers. */
  id: number;
  coord: { q: number; r: number };
  /** Localised building name, e.g. "Reindeer Herder". */
  name: string;
  level: number;
  /** Formatted build duration from the ring card, e.g. "4:00"; null when unknown. */
  time: string | null;
  /** Screen position of the hex's construction dial (where the token starts); null without a renderer. */
  from: { x: number; y: number } | null;
}

/** Longest a queue row stays held back before it shows itself anyway (nobody answered the event). */
const HOLD_TIMEOUT_MS = 8000;

/** Hexes (`"q,r"`) whose new queue row is held back until the confirmation animation reveals it. */
export const heldBuildRows = ref<string[]>([]);
export const confirmedBuild = shallowRef<ConfirmedBuild | null>(null);

const holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
let sequence = 0;

export const coordKey = (c: { q: number; r: number }) => `${c.q},${c.r}`;

/** An optimistic build has started on `coord`: its row stays hidden when the real order shows up, until the confirmation plays. */
export function holdBuildRow(coord: { q: number; r: number }): void {
  const key = coordKey(coord);
  if (!heldBuildRows.value.includes(key)) heldBuildRows.value = [...heldBuildRows.value, key];
  clearTimeout(holdTimers.get(key));
  holdTimers.set(key, setTimeout(() => releaseBuildRow(coord), HOLD_TIMEOUT_MS));
}

export function releaseBuildRow(coord: { q: number; r: number }): void {
  const key = coordKey(coord);
  clearTimeout(holdTimers.get(key));
  holdTimers.delete(key);
  if (heldBuildRows.value.includes(key)) heldBuildRows.value = heldBuildRows.value.filter((k) => k !== key);
}

/** The server accepted the build: the queue UIs may play their feedback now. */
export function announceConfirmedBuild(event: Omit<ConfirmedBuild, 'id'>): void {
  sequence += 1;
  confirmedBuild.value = { ...event, id: sequence };
}
