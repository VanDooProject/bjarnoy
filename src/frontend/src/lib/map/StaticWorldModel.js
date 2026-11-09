// A `WorldModel` whose whole terrain is a fixed, hand-built `Tile[]` instead
// of anything derived from a seed. `WorldModel` itself is built around "every
// answer is a pure function of (q, r, seed)" (see its own module doc
// comment) — great for an actual, effectively-infinite procedural world, but
// exactly backwards for the Wasted Lands docs page's "turning island"
// (WastedIsland.vue / wastedIsland.ts's `buildIslandTiles`): a small, fixed
// layout picked by hand, that should render with the game's own real
// `HexMapRenderer` rather than a second, hand-maintained DOM rendering of the
// same data.
//
// Only the handful of `WorldModel` methods `HexMapRenderer` actually calls
// while drawing a settlement-mode preview with no settlement founded (see
// that class's own `worldModel.*` call sites) are overridden below; every
// other inherited method (settlements, buildings, trade, rivers, fog...) is
// left as `WorldModel`'s own default, which for an instance that never has a
// settlement registered on it already answers "nothing here" (empty lists,
// `undefined`, `false`) without needing its own override.
import { coordKey } from '../hex/coords';
import { WorldModel, terrainKey } from './WorldModel';
export class StaticWorldModel extends WorldModel {
    staticTiles = new Map();
    staticRivers = new Map();
    constructor(tiles = []) {
        super();
        this.setTiles(tiles);
    }
    /** Replaces every tile this model knows about — `WastedIsland.vue` calls this on every rotation/blight-stage change, then `HexMapRenderer.forceRebuild()`s. */
    setTiles(tiles) {
        this.staticTiles = new Map(tiles.map((t) => [coordKey(t), t]));
        this.wallRevision++;
    }
    /** The fixed layout's tiles, so the wall index (which piece a palisade hex draws) sees this model's walls. */
    storedTiles() {
        return this.staticTiles.values();
    }
    /**
     * The stored tile, or a plain sea tile for any coordinate outside the
     * fixed layout. That fallback tile is never actually drawn:
     * `previewCropTiles`/`previewIslandTiles` (below) are the exact set
     * `HexMapRenderer.rebuildTerrain`'s preview branch culls to before it ever
     * calls `getTile`, and only ever list this model's own stored coordinates.
     */
    getTile(q, r) {
        return this.staticTiles.get(coordKey({ q, r })) ?? { q, r, terrain: 'sea' };
    }
    /**
     * `WorldModel.terrainOf` is a class-field arrow function (not a prototype
     * method), so overriding it as an ordinary subclass method wouldn't
     * actually replace what `WorldModel`'s own inherited callers
     * (`isLand`/`getTile`) invoke — this has to be a field too, initialised
     * after `super()` assigns the parent's own copy.
     */
    terrainOf = (q, r) => this.getTile(q, r).terrain;
    /** A stored tile counts as "wasted land" iff it's marked wasted and isn't sea — a wasted coastal-water tile is still water, not land, the same distinction `WorldModel`'s own seed-derived version draws. */
    isWastedLandAt(q, r) {
        const tile = this.staticTiles.get(coordKey({ q, r }));
        return !!tile?.wasted && tile.terrain !== 'sea';
    }
    /** True once any stored tile is wasted — there's no separate "revealed" toggle for a fixed layout the way a real world's endboss-triggered reveal needs; the docs page instead rebuilds the whole `Tile[]` (`buildIslandTiles`) per blight stage. */
    isWastedRevealed() {
        for (const tile of this.staticTiles.values()) {
            if (tile.wasted)
                return true;
        }
        return false;
    }
    /**
     * Every stored tile's coordinate, water included — unlike `WorldModel`'s
     * own flood-fill (which only ever walks land, see its doc comment), the
     * docs island's water ring is part of the fixed layout it should draw,
     * not something to exclude. `center` is `WorldModel`'s own parameter for
     * picking which landmass to flood-fill from; a static layout has exactly
     * one, so every stored tile answers regardless of `center`.
     */
    previewIslandTiles(_center) {
        return Array.from(this.staticTiles.values(), (t) => ({ q: t.q, r: t.r }));
    }
    /**
     * `WorldModel.previewCropTiles` further intersects `previewIslandTiles`
     * with a fixed on-screen radius (a deliberate framing choice for the
     * landing page's small plot preview — see that method's own doc comment);
     * the docs island has no such crop of its own, so every stored tile is
     * both its membership *and* its crop — this is also exactly the set
     * `settlementCameraOrigin`'s locked-preview branch fits the camera to, so
     * the whole island (not a radius-cropped slice of it) ends up on screen.
     */
    previewCropTiles(center, _radius) {
        return this.previewIslandTiles(center);
    }
    /** `coord`'s giant anchor, read straight off the stored tile's own `Tile.giant.anchor` rather than a separate `giantAnchorByHex` index — a static layout has no giant-placement step to populate one during. */
    giantAnchorAt(coord) {
        return this.staticTiles.get(coordKey(coord))?.giant?.anchor ?? null;
    }
    /** The river tiles of the fixed layout, if it has any (the Bog Lands docs island does; the wasted one has none) — drawn by the renderer through `getRiverTile` like a generated island's. */
    setRivers(rivers) {
        this.staticRivers = new Map(rivers.map((r) => [coordKey(r), r]));
        this.riverRevision++;
    }
    /** Only the rivers handed to `setRivers` — a path otherwise depends on generating a whole procedural island (see `WorldModel.getRiverTile`'s own doc comment), so every other lookup is a plain miss. */
    getRiverTile(q, r) {
        return this.staticRivers.get(coordKey({ q, r }));
    }
    /** Mouths among the rivers handed to `setRivers`, packed like `WorldModel.riverMouthHexKeys` (which would walk the parent's empty map here). */
    riverMouthHexKeys() {
        const keys = [];
        for (const tile of this.staticRivers.values()) {
            if (tile.shape === 'mouth')
                keys.push(terrainKey(tile.q, tile.r));
        }
        return keys;
    }
}
