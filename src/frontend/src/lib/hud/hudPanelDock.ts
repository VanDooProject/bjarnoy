// Desktop settlement view: the four HUD panels (Construction, Garrison, Armies, Quests) dock to the four corners of the
// map area. The geometry (where a corner's stack sits), the corner a dropped panel snaps to and the defaults live here
// as plain numbers and pure functions; components/hud/HudPanelDock.vue, HudPanelColumn.vue and stores/hudPrefs.ts
// read them.

export const HUD_PANEL_IDS = ['construction', 'garrison', 'armies', 'quests'] as const;
export type HudPanelId = (typeof HUD_PANEL_IDS)[number];

export const DOCK_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type DockCorner = (typeof DOCK_CORNERS)[number];

export interface HudPanelPref {
  open: boolean;
  corner: DockCorner;
}

/** Today's spots: queue top left, garrison top right, armies bottom right, quests bottom left; all open. */
export const DEFAULT_HUD_PANELS: Readonly<Record<HudPanelId, HudPanelPref>> = {
  construction: { open: true, corner: 'top-left' },
  garrison: { open: true, corner: 'top-right' },
  armies: { open: true, corner: 'bottom-right' },
  quests: { open: true, corner: 'bottom-left' },
};

export function isDockCorner(value: unknown): value is DockCorner {
  return typeof value === 'string' && (DOCK_CORNERS as readonly string[]).includes(value);
}

/** Gutter from the map area's left, right and bottom edges (the 16px HUD gutter of ui-guidelines section 4). */
export const DOCK_GUTTER = 16;
/** Top corners start under the 64px header bar plus 12px. */
export const DOCK_TOP = 76;
/** Between two panels stacked in one corner. */
export const DOCK_STACK_GAP = 8;
/** A corner's stack stops this far above / below the map area's vertical midline. */
export const DOCK_MIDLINE_GAP = 4;
/** The icon column at the bottom left (HudPanelColumn.vue): button size, and the clear space the bottom-left corner keeps from it. */
export const COLUMN_BUTTON_SIZE = 40;
export const COLUMN_BUTTON_GAP = 8;
export const COLUMN_CLEARANCE = 12;
/** Bottom-left corner starts right of the icon column. */
export const DOCK_BOTTOM_LEFT = DOCK_GUTTER + COLUMN_BUTTON_SIZE + COLUMN_CLEARANCE;

/** `--hud-inset-bottom` is MapView's bottom bar height on a bottom-docked mobile HUD (0 on desktop). */
const BOTTOM = `calc(${DOCK_GUTTER}px + var(--hud-inset-bottom, 0px))`;

/** The style of one corner's region: where it sits and how tall its stack may get (never past the vertical midline). */
export function cornerStyle(corner: DockCorner): Record<string, string> {
  const top = corner.startsWith('top');
  const left = corner.endsWith('left');
  return {
    [left ? 'left' : 'right']: `${left ? (top ? DOCK_GUTTER : DOCK_BOTTOM_LEFT) : DOCK_GUTTER}px`,
    [top ? 'top' : 'bottom']: top ? `${DOCK_TOP}px` : BOTTOM,
    maxHeight: top
      ? `calc(50% - ${DOCK_TOP}px - ${DOCK_MIDLINE_GAP}px)`
      : `calc(50% - ${DOCK_GUTTER}px - var(--hud-inset-bottom, 0px) - ${DOCK_MIDLINE_GAP}px)`,
  };
}

export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The corner whose quadrant of `area` holds `centre` (a dropped panel's centre). */
export function nearestCorner(centre: { x: number; y: number }, area: Area): DockCorner {
  const right = centre.x >= area.left + area.width / 2;
  const bottom = centre.y >= area.top + area.height / 2;
  return `${bottom ? 'bottom' : 'top'}-${right ? 'right' : 'left'}` as DockCorner;
}

/** The panels shown in `corner`, in the fixed order (the one nearest the corner first): construction, garrison, armies, quests. */
export function panelsInCorner(
  panels: Readonly<Record<HudPanelId, HudPanelPref>>,
  corner: DockCorner,
  shown: (id: HudPanelId) => boolean = () => true,
): HudPanelId[] {
  return HUD_PANEL_IDS.filter((id) => panels[id].corner === corner && shown(id));
}
