// See RingMenuComponent.ts for why `expect` comes from here, not `../fixtures`.
import { expect, type Locator, type Page } from '@playwright/test';
import { captureCanvas, waitForMapReady } from '../support/render';
import { BuildingHudComponent } from './BuildingHudComponent';
import { OnboardingComponent } from './OnboardingComponent';
import { RingMenuComponent } from './RingMenuComponent';

export interface HexCoord {
  q: number;
  r: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** A hex plus where the renderer's own camera math puts it on screen. */
export interface HexTarget {
  hex: HexCoord;
  screen: ScreenPoint;
}

/**
 * Which hex `findHex` should hand back. Owned-by-this-settlement and
 * building-free are implied — every caller wants both — so only the
 * distinguishing conditions are spelled out here.
 */
export interface HexQuery {
  /** Exact terrain, e.g. 'grass', 'forest', 'sand', 'sea'. */
  terrain?: string;
  /** Any terrain except this one, e.g. "anything but sea". */
  notTerrain?: string;
  /** Require `tile.isCoastalWater` — what actually offers the Water category. */
  coastalWater?: boolean;
  /**
   * Inject a straight river tile onto the chosen hex before returning it.
   * Demo mode never calls `setRiverTiles` on its own, so a spec that builds
   * something with a `RequiresRiverShape` (Sawmill) has to put the river
   * there first, the same way WorldModel.test.ts does.
   */
  withRiver?: boolean;
  /**
   * Hexes from the longhouse to scan, when the realm reaches past its centre
   * disc (a Tower's satellite disc, see `standTowerTowardCoast`). Defaults to
   * the centre disc's own radius, so the scan order — and the hex every other
   * spec gets back — is unchanged.
   */
  reach?: number;
  /** A hex no settlement claims (the ring's Send settlers / Land here) instead of one of the realm's own. */
  unclaimed?: boolean;
  /**
   * `true`: only a shoreline hex (land with an open-sea neighbour, where the ring offers Land here); `false`: never one
   * (the ring offers Send settlers). Unset: either.
   */
  shoreline?: boolean;
  /**
   * Of the matching hexes, the one drawn closest to this canvas point rather
   * than the first in scan order — for a spec that needs the ring opened at a
   * particular part of the screen (e.g. low on a phone, above the docked card).
   */
  nearest?: ScreenPoint;
}

/**
 * The settlement view (and the landing page's onboarding step, which mounts
 * the same renderer and the same ring menu).
 *
 * The point of this class is rule 2 of `e2e/AGENTS.md`: no spec should
 * hand-derive a hex's pixel position from `canvas.boundingBox()` again. It
 * talks to the app's own test hooks instead — `window.__demoWorld()` for
 * model state and `window.__settlementRenderer().hexCenterScreen()` for the
 * screen point — which is what `findHex` used to be a copy-pasted
 * `page.evaluate` block for in ten places.
 *
 * The renderer hook is typed once in `globals.d.ts`; `__demoWorld` is declared
 * there untyped, so each method narrows it to the slice of the store it reads
 * (`window.__demoWorld() as { model: any; selectedSettlementId: string }`).
 */
export class SettlementPage {
  readonly canvas: Locator;
  /** The hovered-hex tooltip the renderer draws. */
  readonly tooltip: Locator;
  /** ArmyPanel's card, which floats above the canvas in the bottom-right. */
  readonly statusCard: Locator;
  /** The onboarding quest tray (QuestTray.vue) shown in the settlement view. */
  readonly questTray: Locator;
  readonly ring: RingMenuComponent;
  /** The building HUD: markers over the own buildings and its toggle. */
  readonly hud: BuildingHudComponent;
  /** The guided onboarding on the landing page: its UI and flows (see OnboardingComponent). */
  readonly onboarding: OnboardingComponent;
  /** Player logout/login gate: HudNav's authenticated avatar dropdown trigger (only mounted once founded). */
  readonly accountMenuTrigger: Locator;
  /** The opened account dropdown panel (Profile / Log out). */
  readonly accountMenu: Locator;
  /** The account dropdown's "Log out" row — triggers useLogout's full page reload to '/'. */
  readonly accountMenuLogoutButton: Locator;
  /** Player logout/login gate: replaces the founding column when this device remembers a logged-out account (ReturningLoginPanel.vue). */
  readonly returningLoginPanel: Locator;
  /** The panel's password field. */
  readonly returningLoginPasswordInput: Locator;
  /** The panel's submit button. */
  readonly returningLoginSubmitButton: Locator;
  /** The panel's login-error text, if any. */
  readonly returningLoginErrorText: Locator;
  /** The panel's "Start a new realm instead" decline button. */
  readonly returningLoginNewRealmButton: Locator;

  private canvasBoxCache: { x: number; y: number; width: number; height: number } | null = null;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('canvas');
    this.tooltip = page.locator('.hex-tooltip');
    this.statusCard = page.locator('.status-card');
    this.questTray = page.getByTestId('quest-tray');
    this.ring = new RingMenuComponent(page);
    this.hud = new BuildingHudComponent(page);
    this.onboarding = new OnboardingComponent(page, () => this.canvasBox());
    this.accountMenuTrigger = page.getByTestId('account-menu-trigger');
    this.accountMenu = page.getByTestId('account-menu');
    this.accountMenuLogoutButton = page.getByTestId('account-menu-logout');
    this.returningLoginPanel = page.getByTestId('returning-login-panel');
    this.returningLoginPasswordInput = page.getByTestId('returning-login-password');
    this.returningLoginSubmitButton = page.getByTestId('returning-login-submit');
    this.returningLoginErrorText = page.getByTestId('returning-login-error');
    this.returningLoginNewRealmButton = page.getByTestId('returning-login-new-realm');
  }

  /**
   * Founds a settlement on the landing page (zip 6a: the landing page is the
   * village view — the starter plot is deterministic, so there's exactly one
   * hex to click, not a grid sweep across a world map), places the 2 guided
   * onboarding buildings, hands off to the settlement view
   * (`onboarding.enterSettlement()`), and waits for /settlement. Returns its view.
   *
   * Design handoff "2a": onboarding's own forced nickname modal is gone —
   * completion now shows a dismissible banner with an explicit "Enter your
   * settlement" CTA (OnboardingBanner.vue), which is what this now waits on
   * and clicks instead of the old button.confirm.
   */
  static async found(page: Page): Promise<SettlementPage> {
    const onboarding = new OnboardingComponent(page);
    // found() alone — page load plus a real PixiJS/texture mount —
    // has been observed crossing the global 45s default on a loaded CI
    // runner. See settlement-interactions.spec.ts's matching comments for the
    // other tests that share this same root cause.
    await page.goto('/#no-intro');

    // Wait on the renderer's own mount-complete signal rather than guessing
    // how long that takes — a fixed sleep here either wastes time on a fast
    // machine or, on a loaded CI runner, races the click below landing before
    // `mount()` has wired up pointer handling at all.
    await waitForMapReady(page);

    await onboarding.claimLandfall();

    await onboarding.placeGuidedBuildings();

    await onboarding.enterSettlement();
    await page.waitForURL('**/settlement');
    // The click navigates to a *new* SettlementCanvas mount (a fresh renderer,
    // not the landing page's preview one) — wait for its own mount-complete
    // signal instead of guessing how long that takes.
    await waitForMapReady(page);
    return new SettlementPage(page);
  }

  /** Opens the landing page (the same renderer, pre-founding) and waits for it to mount. */
  static async openLanding(page: Page): Promise<SettlementPage> {
    await page.goto('/#no-intro');
    await waitForMapReady(page);
    return new SettlementPage(page);
  }

  /** The canvas's on-screen box. Cached — the canvas fills the viewport and never moves. */
  async canvasBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    this.canvasBoxCache ??= (await this.canvas.boundingBox())!;
    return this.canvasBoxCache;
  }

  /**
   * A raw frame of the canvas, for `Buffer.compare` against a later one.
   * Clipped to the canvas's box rather than taken off the canvas locator —
   * `captureCanvas` documents why that difference is worth several seconds
   * per frame on a software-rendered runner.
   */
  async screenshot(): Promise<Buffer> {
    return captureCanvas(this.page, await this.canvasBox());
  }

  /** Canvas centre, in page coordinates. */
  async canvasCentre(): Promise<ScreenPoint> {
    const box = await this.canvasBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /**
   * The first empty, owned hex inside the realm matching `query`, with the
   * screen point the renderer would draw it at. Throws (failing the test
   * with the query that found nothing) rather than returning null: a demo
   * seed with no such hex is a broken fixture, not a passing case.
   */
  findHex(query: HexQuery = {}): Promise<HexTarget> {
    return this.page.evaluate((q) => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string };
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const radius = q.reach ?? world.model.borderRadius(settlement);
      const renderer = window.__settlementRenderer();
      let best: { hex: { q: number; r: number }; screen: { x: number; y: number }; d: number } | null = null;
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > radius) continue;
          const at = { q: settlement.q + dq, r: settlement.r + dr };
          const tile = world.model.getTile(at.q, at.r);
          if (q.unclaimed ? tile.ownerId : tile.ownerId !== world.selectedSettlementId) continue;
          if (tile.buildingType) continue;
          if (q.terrain !== undefined && tile.terrain !== q.terrain) continue;
          if (q.notTerrain !== undefined && tile.terrain === q.notTerrain) continue;
          if (q.coastalWater && !tile.isCoastalWater) continue;
          if (q.shoreline !== undefined) {
            const sides = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
            const land = tile.terrain !== 'sea' && tile.terrain !== 'lake';
            const shore = land && sides.some(([sq, sr]) => world.model.terrainOf(at.q + sq, at.r + sr) === 'sea');
            if (shore !== q.shoreline) continue;
          }
          if (q.nearest) {
            const screen = renderer.hexCenterScreen(at);
            const d = Math.hypot(screen.x - q.nearest.x, screen.y - q.nearest.y);
            if (!best || d < best.d) best = { hex: at, screen, d };
            continue;
          }
          if (q.withRiver) {
            world.model.setRiverTiles([
              { q: at.q, r: at.r, shape: 'straight', inDirections: [], outDirection: null },
            ]);
          }
          return { hex: at, screen: renderer.hexCenterScreen(at) };
        }
      }
      if (best) {
        if (q.withRiver) {
          world.model.setRiverTiles([{ q: best.hex.q, r: best.hex.r, shape: 'straight', inDirections: [], outDirection: null }]);
        }
        return { hex: best.hex, screen: best.screen };
      }
      throw new Error(
        `no empty ${q.unclaimed ? 'unclaimed' : 'owned'} hex matching ${JSON.stringify(q)} found inside the realm — pick a different demo seed`,
      );
    }, query);
  }

  /**
   * Stands a Tower on the realm's own hex nearest the closest coastal water,
   * levelled until its satellite disc (one hex per level, BuildingCatalogue's
   * Tower ClaimRadius, at most level 10) reaches that water — the way a player
   * would push the border to the shore. A good start position never has sea
   * within two hexes, so the centre disc only reaches coastal water when the
   * coast happens to lie exactly at its edge. Goes through
   * `placeBuilding`/`upgradeBuilding`, which re-claim the Tower's disc.
   * Returns how far from the longhouse the realm can now reach, for
   * `findHex`'s `reach`.
   */
  async standTowerTowardCoast(): Promise<number> {
    return this.page.evaluate(() => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string; syncHud: () => void };
      const id = world.selectedSettlementId;
      const settlement = world.model.getSettlement(id);
      const distance = (a: { q: number; r: number }, b: { q: number; r: number }) =>
        (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
      const disc = (radius: number) => {
        const out: { q: number; r: number }[] = [];
        for (let dq = -radius; dq <= radius; dq++) {
          for (let dr = -radius; dr <= radius; dr++) {
            if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= radius) out.push({ q: settlement.q + dq, r: settlement.r + dr });
          }
        }
        return out;
      };
      const coast = disc(12)
        .filter((c) => world.model.getTile(c.q, c.r).isCoastalWater)
        .sort((a, b) => distance(a, settlement) - distance(b, settlement))[0];
      if (!coast) throw new Error('no coastal water within 12 hexes of the settlement — pick a different demo seed');
      const site = disc(world.model.borderRadius(settlement))
        .filter((c) => {
          const tile = world.model.getTile(c.q, c.r);
          return tile.ownerId === id && !tile.buildingType && !tile.camp && !tile.giant && !world.model.getRiverTile(c.q, c.r) &&
            ['grass', 'forest', 'sand'].includes(tile.terrain);
        })
        .sort((a, b) => distance(a, coast) - distance(b, coast))[0];
      if (!site) throw new Error('no free owned land hex to stand a tower on');
      const towerLevel = distance(site, coast);
      if (towerLevel > 10) throw new Error(`coastal water is ${towerLevel} hexes past the realm, beyond a level-10 tower — pick a different demo seed`);
      if (!world.model.placeBuilding(id, site, 'tower')) throw new Error('could not stand a tower toward the coast');
      for (let l = 1; l < towerLevel; l++) world.model.upgradeBuilding(id, site);
      world.syncHud();
      return distance(site, settlement) + towerLevel;
    });
  }

  /** The longhouse's own hex, and where it is on screen. */
  centreHex(): Promise<HexTarget> {
    return this.page.evaluate(() => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string };
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const at = { q: settlement.q, r: settlement.r };
      return { hex: at, screen: window.__settlementRenderer().hexCenterScreen(at) };
    });
  }

  /** Clicks a hex found by `findHex`/`centreHex`, opening its ring menu. */
  async clickHex(target: HexTarget | ScreenPoint): Promise<void> {
    const screen = 'screen' in target ? target.screen : target;
    const box = await this.canvasBox();
    await this.page.mouse.click(box.x + screen.x, box.y + screen.y);
  }

  /**
   * Sets the camera zoom with one real wheel gesture at the canvas centre (the renderer zooms by `exp(-deltaY * 0.001)`), then
   * parks the mouse in the canvas corner so no hover grows a marker or hides the tier the zoom gives it.
   */
  async zoomTo(target: number): Promise<void> {
    const box = await this.canvasBox();
    const centre = await this.canvasCentre();
    const current = await this.hud.cameraZoom();
    await this.page.mouse.move(centre.x, centre.y);
    await this.page.mouse.wheel(0, -Math.log(target / current) * 1000);
    await expect.poll(() => this.hud.cameraZoom()).toBeCloseTo(target, 1);
    await this.page.mouse.move(box.x + 5, box.y + 5);
  }

  /** How many buildings this settlement has — the deterministic "did the build land" signal. */
  countBuildings(): Promise<number> {
    return this.page.evaluate(() => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string };
      return world.model.countBuildings(world.selectedSettlementId) as number;
    });
  }

  /** What is standing on a hex, if anything. */
  buildingTypeAt(hex: HexCoord): Promise<string | undefined> {
    return this.page.evaluate(
      (at) => {
        const world = window.__demoWorld() as { model: any };
        return world.model.getTile(at.q, at.r).buildingType as string | undefined;
      },
      hex,
    );
  }

  /** The longhouse tile's own building level (what an Upgrade actually moves). */
  longhouseBuildingLevel(): Promise<number> {
    return this.page.evaluate(() => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string };
      const s = world.model.getSettlement(world.selectedSettlementId);
      return world.model.getTile(s.q, s.r).buildingLevel as number;
    });
  }

  /**
   * Levels the settlement up, the way a player would have to before a
   * `RequiredLonghouseLevel` building unlocks — rather than weakening the
   * gate for the test.
   */
  async setSettlementLevel(level: number): Promise<void> {
    await this.page.evaluate((value) => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string; syncHud: () => void };
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      settlement.level = value;
      // Border radius grows with level (WorldModel.borderRadius) — re-claim
      // so the wider territory is actually owned, not just reported by
      // borderRadius(). Without this, a hex a test expects to reach after
      // levelling up (e.g. coastal water just past the level-1 radius)
      // never gets marked as owned, since claimTerritory is what paints
      // ownership and it only ran once, at founding, against the old level.
      world.model.claimTerritory(settlement.id);
      world.syncHud();
    }, level);
  }

  /**
   * Stands buildings of these types and levels on free owned land hexes —
   * for a building whose `prerequisites` (BuildingCatalogue.cs, mirrored by
   * the ring's lock) need another building first, the way a player would have
   * to build it, rather than weakening the gate for the test. Picks hexes from
   * the far end of the realm's scan, so `findHex` (which scans from the near
   * end) still hands back the same target it would have otherwise.
   */
  async standBuildings(buildings: { type: string; level: number }[]): Promise<void> {
    await this.page.evaluate((wanted) => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string; syncHud: () => void };
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const radius = world.model.borderRadius(settlement);
      const free: { q: number; r: number }[] = [];
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > radius) continue;
          const at = { q: settlement.q + dq, r: settlement.r + dr };
          const tile = world.model.getTile(at.q, at.r);
          if (tile.ownerId !== world.selectedSettlementId || tile.buildingType || tile.camp || tile.giant) continue;
          if (!['grass', 'forest', 'sand', 'mountain'].includes(tile.terrain) || world.model.getRiverTile(at.q, at.r)) continue;
          free.push(at);
        }
      }
      for (const building of wanted) {
        const at = free.pop();
        if (!at) throw new Error(`no free owned hex left to stand a ${building.type} on`);
        const tile = world.model.getTile(at.q, at.r);
        tile.buildingType = building.type;
        tile.buildingLevel = building.level;
      }
      world.syncHud();
    }, buildings);
  }

  /** Sets the settlement's stock outright — for the affordability gates. */
  async setResources(resources: { wood: number; stone: number; food: number; iron: number }): Promise<void> {
    await this.page.evaluate((r) => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string; syncHud: () => void };
      world.model.getSettlement(world.selectedSettlementId).resources = r;
      world.syncHud();
    }, resources);
  }

  /**
   * Overrides the settlement's real storage cap (`Settlement.capacity` —
   * `WorldModel.storageCapForDisplay` prefers this over its own
   * level-derived guess, see its own comment) — for pushing the HUD's cap
   * readout to large numbers regardless of settlement level, e.g. to force
   * ResourceBar's short "k"/"M" notation.
   */
  async setStorageCaps(caps: { wood: number; stone: number; food: number; iron: number }): Promise<void> {
    await this.page.evaluate((c) => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string; syncHud: () => void };
      world.model.getSettlement(world.selectedSettlementId).capacity = c;
      world.syncHud();
    }, caps);
  }

  /**
   * Funds the settlement for a late building: raises the storage caps and fills the stock to `amount` of wood, stone and food
   * (stock is clamped to capacity, so the cap goes first).
   */
  async fund(amount: number): Promise<void> {
    await this.setStorageCaps({ wood: amount, stone: amount, food: amount, iron: amount });
    await this.setResources({ wood: amount, stone: amount, food: amount, iron: 0 });
  }

  /**
   * Puts five standing fleets on five different hexes of the open sea, up to ~300 hexes from the settlement (demo mode has no army simulation, so they go straight
   * into the store) and returns an empty, inland grass hex of the realm: no fleet can ever reach it, so every route search for it fails.
   * `screen` is that hex's centre on the settlement canvas. The fleets' home (where a leg must be able to return to) is the settlement, an
   * inland hex no fleet can reach, unless `homeAt` names another (a coastal hex of the realm).
   */
  async putFleetsFarAtSea(
    homeAt?: { q: number; r: number },
  ): Promise<{ hex: { q: number; r: number }; screen: { x: number; y: number } }> {
    return this.page.evaluate((homeOverride) => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string; armies: unknown[] };
      const home = world.model.getSettlement(world.selectedSettlementId);
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;
      const isSea = (q: number, r: number) => world.model.getTile(q, r).terrain === 'sea';
      // One far open-sea hex per fleet, all different: every fleet is its own route search (its own cache key).
      const seas: Array<{ q: number; r: number }> = [];
      for (let d = 300; d > 50 && seas.length < 5; d -= 5) {
        for (const [dq, dr] of sides) {
          const at = { q: home.q + dq * d, r: home.r + dr * d };
          if (seas.length < 5 && isSea(at.q, at.r) && sides.every(([a, b]) => isSea(at.q + a, at.r + b))) seas.push(at);
        }
      }
      if (seas.length < 5) throw new Error('no five open-sea hexes far from home');
      const arrived = new Date(Date.now() - 60_000).toISOString();
      world.armies = seas.map((sea, i) => ({
        id: `fleet-${i}`,
        settlementId: world.selectedSettlementId,
        mission: 'move',
        targetSettlementId: null,
        atHome: false,
        supporting: false,
        position: sea,
        provisions: 1_000_000,
        totalSpeed: 10,
        totalUpkeepPerHour: 1,
        visionRadius: 4,
        stacks: [{ unit: 'longship', count: 1 }],
        movement: { path: [homeOverride ?? { q: home.q, r: home.r }, sea], isReturning: false, departedAt: arrived, arrivesAt: arrived },
      }));
      for (let dq = -3; dq <= 3; dq++) {
        for (let dr = -3; dr <= 3; dr++) {
          const at = { q: home.q + dq, r: home.r + dr };
          const tile = world.model.getTile(at.q, at.r);
          if (tile.ownerId !== world.selectedSettlementId || tile.buildingType || tile.terrain !== 'grass') continue;
          if (sides.some(([a, b]) => isSea(at.q + a, at.r + b))) continue;
          return { hex: at, screen: window.__settlementRenderer().hexCenterScreen(at) };
        }
      }
      throw new Error('no empty inland grass hex in the realm');
    }, homeAt);
  }

  /** Triggers an armies refresh, as the live poll does: every army is replaced by a copy. */
  async refreshArmies(): Promise<void> {
    await this.page.evaluate(() => {
      const world = window.__demoWorld() as { armies: object[] };
      world.armies = world.armies.map((a) => ({ ...a }));
    });
  }

  /** The HUD's current resource read-out. */
  hudResources(): Promise<{ wood: number; iron: number }> {
    return this.page.evaluate(
      () =>
        (window.__demoWorld() as { hud: { resources: { wood: number; iron: number } } }).hud.resources,
    );
  }

  /** Player logout/login gate: opens HudNav's authenticated account dropdown. */
  async openAccountMenu(): Promise<void> {
    await this.accountMenuTrigger.click();
    await expect(this.accountMenu).toBeVisible();
  }

  /**
   * Logs out via the account dropdown. `useLogout` ends in a full page
   * reload (`window.location.assign('/')`), not an in-app navigation — the
   * caller awaits whatever the reloaded page shows next (e.g.
   * `returningLoginPanel`) rather than a URL change, since the reload keeps
   * the same '/' path.
   */
  async logout(): Promise<void> {
    await this.openAccountMenu();
    await this.accountMenuLogoutButton.click();
  }

  /** Fills and submits the returning-login gate's password field (username is pre-filled from `player.lastAccount`). */
  async submitReturningLogin(password: string): Promise<void> {
    await this.returningLoginPasswordInput.fill(password);
    await this.returningLoginSubmitButton.click();
  }
}
