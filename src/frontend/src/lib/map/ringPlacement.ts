/**
 * Opening a tile's ring menu: the one place that makes room for it, shared by every view that
 * opens one (MapView, LandingView's onboarding ring).
 *
 * The ring is always a circle round its tile. A tile near an edge (or the phone's docked card)
 * has no room for that where it is, so the map slides until the tile sits where the ring - with
 * every category it can drill into open in turn - fits, and the ring opens there. Only when no
 * spot on screen has room for the ring at full size does the whole ring shrink (`scale`), still a
 * circle.
 */
import { motionEnabled } from '../motion';
import { ringRoomFor, type Rect, type RingShape } from './ringLayout';

/** How long the map slides to make room for a ring (instant under reduced motion). */
export const RING_ROOM_PAN_MS = 220;

/** Where a ring opens on screen and how big it is (1 = full size). */
export interface RingPlacement {
  x: number;
  y: number;
  scale: number;
}

/** The part of the map renderer that makes room: slide the map (dx, dy) screen px, false if it cannot move. */
export interface RingPanTarget {
  panScreenBy(dx: number, dy: number, durationMs?: number): boolean;
}

/**
 * Pans the map so the ring of the tile at `screen` fits as a circle, and returns where the tile
 * ends up and the ring's size. `boundsAt(x)` is the ring's area with the tile at screen x (a
 * landscape phone docks the card on the side away from the tile); `shapes` are the states the
 * ring can take (`ringShapes`). A map that cannot move (no renderer yet, a locked camera) leaves
 * the tile where it is.
 */
export function placeRing(
  renderer: RingPanTarget | null | undefined,
  screen: { x: number; y: number },
  boundsAt: (x: number) => Rect,
  shapes: RingShape[],
): RingPlacement {
  const room = ringRoomFor(screen.x, screen.y, (x) => boundsAt(x), shapes);
  if (room.x === screen.x && room.y === screen.y) return room;
  const moved = renderer?.panScreenBy(room.x - screen.x, room.y - screen.y, motionEnabled() ? RING_ROOM_PAN_MS : 0);
  return moved ? room : { x: screen.x, y: screen.y, scale: room.scale };
}
