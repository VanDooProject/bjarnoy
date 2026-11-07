import { computed, type ComputedRef } from 'vue';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';
import { ringMaxScale, ringSizePreference } from '../lib/map/ringSize';
import { useMediaQuery } from './useMediaQuery';

/** The size the ring menu opens at when it fits (lib/map/ringSize.ts): phones vs. desktop, times the profile setting. */
export function useRingMaxScale(): ComputedRef<number> {
  const compact = useMediaQuery(HUD_COMPACT_QUERY);
  return computed(() => ringMaxScale(compact.value, ringSizePreference.setting));
}
