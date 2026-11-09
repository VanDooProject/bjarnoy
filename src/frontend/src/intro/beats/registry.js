import FireBeat, { meta as fireMeta } from './FireBeat.vue';
import ProphecyBeat, { meta as prophecyMeta } from './ProphecyBeat.vue';
import SendingBeat, { meta as sendingMeta } from './SendingBeat.vue';
import RavensBeat, { meta as ravensMeta } from './RavensBeat.vue';
import HoldBeat, { meta as holdMeta, landfallMeta } from './HoldBeat.vue';
/** Story order. Each beat's meta lives next to its component. */
export const BEATS = [fireMeta, prophecyMeta, sendingMeta, ravensMeta, holdMeta, landfallMeta];
export const BEAT_COMPONENTS = {
    fire: FireBeat,
    prophecy: ProphecyBeat,
    sending: SendingBeat,
    ravens: RavensBeat,
    hold: HoldBeat,
    // same component as the hold: the host keeps it mounted (shared `scene`) and the landfall plays on it
    landfall: HoldBeat,
};
