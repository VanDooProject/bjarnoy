// The frozen pack's tile families, one card each. A look is one frame; `labelKey` names it where the looks differ
// by kind (glacier vs spring, river shapes) rather than being plain variants of one tile.
export interface FrozenLook {
  frame: string;
  labelKey?: string;
}
export interface FrozenFamily {
  id: string;
  looks: FrozenLook[];
}

function variants(family: string, suffixes: string[]): FrozenLook[] {
  return suffixes.map((suffix) => ({ frame: `${family}_SE${suffix}` }));
}

export const FROZEN_FAMILIES: FrozenFamily[] = [
  {
    id: "snowfield",
    looks: variants("snowfield", [
      "",
      "_variant001",
      "_variant002",
      "_variant003",
      "_variant004",
      "_variant005",
    ]),
  },
  { id: "snowforest", looks: variants("snowforest", ["", "_variant001"]) },
  { id: "frostshingle", looks: variants("frostshingle", ["", "_variant001"]) },
  {
    id: "icecoast",
    looks: variants("icecoast", ["", "_variant000", "_variant001", "_variant002"]),
  },
  { id: "packice", looks: variants("packice", [""]) },
  {
    id: "glacier",
    looks: [
      { frame: "mountaintile_glacier_SE_level000", labelKey: "glacier" },
      { frame: "mountaintile_glacier_spring_SE_level000", labelKey: "glacierSpring" },
    ],
  },
  {
    id: "river",
    looks: [
      { frame: "frozenriver_SE", labelKey: "straight" },
      { frame: "frozenriver_bend_SE", labelKey: "bend" },
      { frame: "frozenriver_bend60_SE", labelKey: "bend60" },
    ],
  },
];
