import type { Component } from 'vue';
import FireBeat, { meta as fireMeta } from './FireBeat.vue';
import ProphecyBeat, { meta as prophecyMeta } from './ProphecyBeat.vue';
import RavensBeat, { meta as ravensMeta } from './RavensBeat.vue';
import SendingBeat, { meta as sendingMeta } from './SendingBeat.vue';
import HoldBeat, { meta as holdMeta } from './HoldBeat.vue';
import LandfallBeat, { meta as landfallMeta } from './LandfallBeat.vue';
import type { BeatId, BeatMeta } from './types';

/** Story order. Each beat's meta lives next to its component. */
export const BEATS: BeatMeta[] = [fireMeta, prophecyMeta, ravensMeta, sendingMeta, holdMeta, landfallMeta];

export const BEAT_COMPONENTS: Record<BeatId, Component> = {
  fire: FireBeat,
  prophecy: ProphecyBeat,
  ravens: RavensBeat,
  sending: SendingBeat,
  hold: HoldBeat,
  landfall: LandfallBeat,
};
