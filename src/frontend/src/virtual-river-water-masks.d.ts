// The module served by build/waterDryMasks.ts.
declare module 'virtual:river-water-masks' {
  import type { WaterDryMasksData } from './lib/map/water/dryMaskCore';
  const data: WaterDryMasksData;
  export default data;
}
